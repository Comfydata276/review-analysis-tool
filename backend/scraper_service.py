import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal
from . import models, crud


def utc_from_unix(ts: int) -> datetime:
	return datetime.fromtimestamp(ts, tz=timezone.utc)


def parse_date(date_str: Optional[str], *, end_of_day: bool = False) -> Optional[datetime]:
	if not date_str:
		return None
	base = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
	if end_of_day:
		# inclusive end-of-day
		return base + timedelta(days=1) - timedelta(microseconds=1)
	return base


@dataclass
class ScrapeSettings:
	# Order fields so non-defaults come before defaults to satisfy dataclass rules.
	# Required (non-default) fields:
	rate_limit_rpm: int
	language: str
	# Optional cap; when None and complete_scraping is True we attempt to fetch all matches
	max_reviews: Optional[int] = None
	complete_scraping: bool = False
	# Playtime filters in hours
	min_playtime: Optional[float] = None
	max_playtime: Optional[float] = None
	start_date: Optional[datetime] = None
	end_date: Optional[datetime] = None
	early_access: str = "include"  # include | exclude | only
	received_for_free: str = "include"  # include | exclude | only



@dataclass
class Progress:
	is_running: bool = False
	current_game: Optional[Dict[str, Any]] = None
	current_game_scraped: int = 0
	current_game_total: int = 0
	current_game_target: int = 0
	global_scraped: int = 0
	global_total: int = 0
	avg_request_seconds: float = 0.0
	# rate limit (requests per minute) used to compute ETA conservatively
	rate_limit_rpm: int = 60
	# Timestamp when current run started (UTC)
	start_time: Optional[datetime] = None
	# global_scraped value at start_time (so we can compute observed rate)
	start_global_scraped: int = 0
	requests_made: int = 0
	logs: List[str] = field(default_factory=list)
	stop_requested: bool = False

	def log(self, message: str) -> None:
		self.logs.append(f"{datetime.now(timezone.utc).isoformat()} {message}")
		if len(self.logs) > 100:
			self.logs = self.logs[-100:]

	def eta_seconds_current(self) -> int:
		if self.current_game_total <= 0:
			return 0
		remaining_reviews = max(self.current_game_total - self.current_game_scraped, 0)
		# Estimate reviews/sec using observed rate (saves since start) capped by
		# the theoretical max given the rate limit and page size.
		theoretical_reviews_per_sec = (self.rate_limit_rpm * 100.0) / 60.0
		observed_rate = 0.0
		if self.start_time is not None:
			elapsed = (datetime.utcnow() - self.start_time).total_seconds()
			if elapsed > 0:
				observed = max(0, self.global_scraped - self.start_global_scraped)
				observed_rate = observed / elapsed
		# If we have an observed rate use it (but never exceed theoretical max),
		# otherwise fall back to a conservative fraction of the theoretical max.
		expected_rate = observed_rate if observed_rate > 0 else (theoretical_reviews_per_sec * 0.9)
		expected_rate = min(expected_rate, theoretical_reviews_per_sec)
		if expected_rate <= 0:
			return 0
		return int(remaining_reviews / expected_rate)

	def eta_seconds_global(self) -> int:
		if self.global_total <= 0:
			return 0
		remaining_reviews = max(self.global_total - self.global_scraped, 0)
		theoretical_reviews_per_sec = (self.rate_limit_rpm * 100.0) / 60.0
		observed_rate = 0.0
		if self.start_time is not None:
			elapsed = (datetime.utcnow() - self.start_time).total_seconds()
			if elapsed > 0:
				observed = max(0, self.global_scraped - self.start_global_scraped)
				observed_rate = observed / elapsed
		expected_rate = observed_rate if observed_rate > 0 else (theoretical_reviews_per_sec * 0.9)
		expected_rate = min(expected_rate, theoretical_reviews_per_sec)
		if expected_rate <= 0:
			return 0
		return int(remaining_reviews / expected_rate)


class ScraperService:
	def __init__(self) -> None:
		self._lock = asyncio.Lock()
		self._task: Optional[asyncio.Task] = None
		self.progress = Progress()

	async def start(self, settings_payload: Dict[str, Any]) -> None:
		async with self._lock:
			if self.progress.is_running:
				raise RuntimeError("Scraper already running")
			# Validate playtime bounds in global settings and per-game overrides
			global_settings = settings_payload.get("global_settings", {})
			def _to_float_safe(v):
				try:
					return float(v) if v is not None else None
				except Exception:
					return None
			min_pt = _to_float_safe(global_settings.get("min_playtime"))
			max_pt = _to_float_safe(global_settings.get("max_playtime"))
			if min_pt is not None and max_pt is not None and max_pt <= min_pt:
				raise ValueError("Max playtime must be greater than Min playtime")
			# Validate per-game overrides
			per_game_overrides: Dict[str, Dict[str, Any]] = settings_payload.get("per_game_overrides", {})
			for k, override in (per_game_overrides or {}).items():
				omin = _to_float_safe(override.get("min_playtime"))
				omax = _to_float_safe(override.get("max_playtime"))
				if omin is not None and omax is not None and omax <= omin:
					raise ValueError(f"For override {k}: Max playtime must be greater than Min playtime")

			self.progress = Progress(is_running=True)
			self.progress.log("Starting scraper")
			self._task = asyncio.create_task(self._run(settings_payload))

	async def stop(self) -> None:
		async with self._lock:
			if self.progress.is_running:
				self.progress.stop_requested = True
				self.progress.log("Stop requested")

	async def _run(self, settings_payload: Dict[str, Any]) -> None:
		try:
			global_settings = settings_payload.get("global_settings", {})
			per_game_overrides: Dict[str, Dict[str, Any]] = settings_payload.get("per_game_overrides", {})

			def make_settings(raw: Dict[str, Any]) -> ScrapeSettings:
				complete = bool(raw.get("complete_scraping", False))
				max_rev = None if complete else int(raw.get("max_reviews", 1000))
				# parse optional numeric filters safely
				def _to_float(v: Any) -> Optional[float]:
					if v is None or v == "":
						return None
					try:
						return float(v)
					except Exception:
						return None

				return ScrapeSettings(
					max_reviews=max_rev,
					complete_scraping=complete,
					rate_limit_rpm=max(1, int(raw.get("rate_limit_rpm", 60))),
					language=str(raw.get("language", "english")),
					start_date=parse_date(raw.get("start_date"), end_of_day=False),
					end_date=parse_date(raw.get("end_date"), end_of_day=True),
					early_access=str(raw.get("early_access", "include")),
					received_for_free=str(raw.get("received_for_free", "include")),
					min_playtime=_to_float(raw.get("min_playtime")),
					max_playtime=_to_float(raw.get("max_playtime")),
				)

			g_settings = make_settings(global_settings)
			# Initialize run-level ETA baselines
			self.progress.start_time = datetime.utcnow()
			self.progress.start_global_scraped = 0
			self.progress.rate_limit_rpm = g_settings.rate_limit_rpm

			# Load active games
			db: Session = SessionLocal()
			try:
				active_games = crud.list_games(db)
			except Exception:
				db.close()
				raise

			# Initialize global total estimate. When doing complete scraping we
			# don't have a per-game cap so initialize to 0 and accumulate when
			# each game's store-provided total is known.
			if g_settings.complete_scraping:
				self.progress.global_total = 0
			else:
				self.progress.global_total = len(active_games) * (g_settings.max_reviews or 0)
			self.progress.global_scraped = 0
			self.progress.start_time = datetime.utcnow()
			self.progress.start_global_scraped = self.progress.global_scraped

			for game in active_games:
				if self.progress.stop_requested:
					break
				settings_for_game = make_settings({**global_settings, **per_game_overrides.get(str(game.app_id), {})})
				await self._scrape_game(game, settings_for_game)
		finally:
			self.progress.is_running = False
			self.progress.current_game = None
			self.progress.log("Scraper finished")

	async def _rate_limit_sleep(self, rpm: int) -> None:
		# Minimal sleep to respect rpm; rpm is requests per minute
		seconds = max(0.0, 60.0 / max(1, rpm))
		await asyncio.sleep(seconds)

	async def _scrape_game(self, game: models.Game, settings_for_game: ScrapeSettings) -> None:
		self.progress.current_game = {"app_id": game.app_id, "name": game.name}
		# Initialize current scraped count with existing DB matches so UI shows correct starting point
		self.progress.current_game_scraped = 0
		self.progress.current_game_total = 0
		# Show the configured target for UI; for complete scraping this may be
		# unknown until we learn the store's total for the game.
		self.progress.current_game_target = settings_for_game.max_reviews or 0
		self.progress.log(f"Starting scrape for {game.name} ({game.app_id})")

		cursor = "*"
		saved_count = 0
		no_new_found = False
		# Track duplicate/no-save pages when starting from newest
		consecutive_no_save_pages = 0
		DUPLICATE_PAGE_LIMIT = 3
		client = httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS)
		try:
			# Determine resume threshold. Query the latest review that matches the
			# current filters so we don't prematurely stop when DB contains reviews
			# that don't meet the current settings (e.g., playtime bounds).
			db: Session = SessionLocal()
			try:
				q_latest = db.query(func.max(models.Review.review_date)).filter(models.Review.app_id == game.app_id)
				# apply same filters used below when counting existing matches
				if settings_for_game.start_date is not None:
					cs = settings_for_game.start_date.replace(tzinfo=None) if settings_for_game.start_date.tzinfo is not None else settings_for_game.start_date
					q_latest = q_latest.filter(models.Review.review_date >= cs)
				end_date_cmp_tmp: Optional[datetime] = settings_for_game.end_date
				if end_date_cmp_tmp and end_date_cmp_tmp.tzinfo is not None:
					end_date_cmp_tmp = end_date_cmp_tmp.replace(tzinfo=None)
				if end_date_cmp_tmp is not None:
					q_latest = q_latest.filter(models.Review.review_date <= end_date_cmp_tmp)
				lang_tmp = (settings_for_game.language or "").lower()
				if lang_tmp:
					q_latest = q_latest.filter(func.lower(models.Review.language) == lang_tmp)
				if settings_for_game.early_access == "exclude":
					q_latest = q_latest.filter(models.Review.early_access == False)
				if settings_for_game.early_access == "only":
					q_latest = q_latest.filter(models.Review.early_access == True)
				if settings_for_game.received_for_free == "exclude":
					q_latest = q_latest.filter(models.Review.received_for_free == False)
				if settings_for_game.received_for_free == "only":
					q_latest = q_latest.filter(models.Review.received_for_free == True)
				if settings_for_game.min_playtime is not None:
					q_latest = q_latest.filter(models.Review.playtime_hours >= float(settings_for_game.min_playtime))
				if settings_for_game.max_playtime is not None:
					q_latest = q_latest.filter(models.Review.playtime_hours <= float(settings_for_game.max_playtime))
				latest: Optional[datetime] = q_latest.scalar()
			finally:
				db.close()

			# Keep original configured start date for counting existing matches
			configured_start = settings_for_game.start_date
			threshold_start = configured_start
			# Normalize for comparison (DB datetimes are naive UTC)
			threshold_start_cmp = (
				threshold_start.replace(tzinfo=None)
				if (threshold_start is not None and threshold_start.tzinfo is not None)
				else threshold_start
			)
			# Resume from newest in DB if it's newer than start_date.
			# This ensures we only fetch reviews newer than what's stored unless a newer start_date is provided.
			if latest:
				if threshold_start_cmp is None or latest > threshold_start_cmp:
					threshold_start = latest

			# Count existing reviews in DB that already meet the filters so we only fetch the remainder
			existing_db_count = 0
			db2: Session = SessionLocal()
			try:
				q = db2.query(func.count()).filter(models.Review.app_id == game.app_id)
				# apply filters based on the configured settings (not the resume threshold)
				if configured_start is not None:
					cs = configured_start.replace(tzinfo=None) if configured_start.tzinfo is not None else configured_start
					q = q.filter(models.Review.review_date >= cs)
				end_date_cmp: Optional[datetime] = settings_for_game.end_date
				if end_date_cmp and end_date_cmp.tzinfo is not None:
					end_date_cmp = end_date_cmp.replace(tzinfo=None)
				if end_date_cmp is not None:
					q = q.filter(models.Review.review_date <= end_date_cmp)
				# language filter
				lang = (settings_for_game.language or "").lower()
				if lang:
					q = q.filter(func.lower(models.Review.language) == lang)
				if settings_for_game.early_access == "exclude":
					q = q.filter(models.Review.early_access == False)
				if settings_for_game.early_access == "only":
					q = q.filter(models.Review.early_access == True)
				if settings_for_game.received_for_free == "exclude":
					q = q.filter(models.Review.received_for_free == False)
				if settings_for_game.received_for_free == "only":
					q = q.filter(models.Review.received_for_free == True)
				# Playtime filters (hours) - ensure existing DB count respects min/max playtime
				min_pt = settings_for_game.min_playtime
				max_pt = settings_for_game.max_playtime
				if min_pt is not None:
					q = q.filter(models.Review.playtime_hours >= float(min_pt))
				if max_pt is not None:
					q = q.filter(models.Review.playtime_hours <= float(max_pt))
				existing_db_count = int(q.scalar() or 0)
			finally:
				db2.close()

			# Add existing DB count to progress so UI logs/ETA start from current DB state
			self.progress.current_game_scraped = existing_db_count
			self.progress.global_scraped += existing_db_count
			# If already have enough reviews, skip scraping
			# Debug: log counts to help diagnose resume behavior
			self.progress.log(
				f"Resume check for {game.name}: latest_in_db={latest}, configured_start={configured_start}, existing_matches={existing_db_count}, requested_max={settings_for_game.max_reviews}"
			)
			# Additional debug to help understand complete_scraping behavior
			self.progress.log(
				f"Settings: complete_scraping={settings_for_game.complete_scraping}, rate_limit={settings_for_game.rate_limit_rpm}, language={settings_for_game.language}"
			)
			# If complete_scraping is requested, we don't cap by max_reviews and
			# instead attempt to fetch all reviews (remaining_needed=None).
			if settings_for_game.complete_scraping:
				remaining_needed = None
			else:
				remaining_needed = max(0, (settings_for_game.max_reviews or 0) - existing_db_count)
			if remaining_needed is not None and remaining_needed <= 0:
				self.progress.log(f"No new reviews for '{game.name}' are avaliable. All reviews that meet the configuration settings have been gathered.")
				return
			# Log computed remaining_needed before scraping
			self.progress.log(f"Computed remaining_needed={remaining_needed}")

			# If user did not set a start_date and DB already has some reviews, allow
			# scraping older pages by clearing the resume threshold. This must also
			# apply when `complete_scraping` is requested (remaining_needed is None),
			# so treat None as "more needed".
			if configured_start is None and existing_db_count > 0 and (remaining_needed is None or remaining_needed > 0):
				threshold_start = None

			while True:
				params = {
					"json": 1,
					"filter": "recent",
					"language": settings_for_game.language,
					"num_per_page": 100,
					"cursor": cursor,
				}
				url = f"https://store.steampowered.com/appreviews/{game.app_id}"
				start_req = time.perf_counter()
				resp = await client.get(url, params=params)
				elapsed = time.perf_counter() - start_req
				# Update average request time
				self.progress.requests_made += 1
				if self.progress.avg_request_seconds <= 0:
					self.progress.avg_request_seconds = elapsed
				else:
					self.progress.avg_request_seconds = (
						self.progress.avg_request_seconds * (self.progress.requests_made - 1) + elapsed
					) / self.progress.requests_made

				resp.raise_for_status()
				payload = resp.json()
				reviews = payload.get("reviews", []) or []
				qsum = payload.get("query_summary", {}) or {}
				if self.progress.current_game_total == 0:
					# Steam provides a rough total of available reviews (qsum). For UI progress
					# and ETA we prefer to use the user-requested target (`max_reviews`) so the
					# progress bar and ETA reflect the configured goal rather than the full
					# number of reviews available on the store. If the store reports fewer
					# reviews than requested, use the store count.
					q_total = int(qsum.get("total_reviews") or qsum.get("num_reviews") or 0)
					if q_total > 0:
						if settings_for_game.complete_scraping:
							# When doing complete scraping, prefer the store's total
							self.progress.current_game_total = q_total
						else:
							self.progress.current_game_total = min(q_total, settings_for_game.max_reviews or 0)
					else:
						# Fallback to requested max (or 0) if store doesn't provide an estimate
						self.progress.current_game_total = settings_for_game.max_reviews or 0
					# Adjust global total. If global_total was initialized to 0
					# (complete mode) just accumulate; otherwise replace the
					# per-game rough estimate with the chosen estimate.
					if self.progress.global_total <= 0:
						self.progress.global_total += self.progress.current_game_total
					else:
						self.progress.global_total -= (settings_for_game.max_reviews or 0)
						self.progress.global_total += self.progress.current_game_total
					# If we're doing complete scraping, update the UI target to the store total
					if settings_for_game.complete_scraping:
						self.progress.current_game_target = self.progress.current_game_total

				# If all returned reviews are older than our threshold (i.e. nothing new), stop
				if reviews:
					# compute max timestamp in batch
					batch_max_ts = max((int(r.get("timestamp_created") or 0) for r in reviews), default=0)
					batch_max_dt = utc_from_unix(batch_max_ts).replace(tzinfo=None)
					threshold_cmp = (
						threshold_start.replace(tzinfo=None)
						if (threshold_start is not None and threshold_start.tzinfo is not None)
						else threshold_start
					)
					if threshold_cmp is not None and batch_max_dt <= threshold_cmp:
						# Friendly log explaining why we are stopping early
						self.progress.log(
							f"No new reviews for '{game.name}' are avaliable. All reviews that meet the configuration settings have been gathered."
						)
						no_new_found = True
						break

				# Save batch (cap to remaining_needed)
				saved_this_batch = await self._save_reviews(
					game.app_id,
					reviews,
					settings_for_game,
					threshold_start,
					max_to_save=remaining_needed,
				)
				saved_count += saved_this_batch
				self.progress.current_game_scraped += saved_this_batch
				self.progress.global_scraped += saved_this_batch
				if remaining_needed is not None:
					remaining_needed -= saved_this_batch
				# Track duplicate/no-save pages when starting from newest; helps decide when to jump to saved cursor
				if saved_this_batch == 0:
					consecutive_no_save_pages += 1
				else:
					consecutive_no_save_pages = 0
				# (cursor persistence removed)
				self.progress.log(
					f"Fetched {len(reviews)} reviews (saved {saved_this_batch}) "
					f"({self.progress.current_game_scraped}/{self.progress.current_game_total} total)"
				)

				# Respect stop flag after finishing saving current batch
				if self.progress.stop_requested:
					self.progress.log("Stopping scrape after current request")
					break

				if not reviews:
					break
				if remaining_needed is not None and remaining_needed <= 0:
					break

				# Next cursor
				cursor = payload.get("cursor") or cursor
				# Respect rate limit
				await self._rate_limit_sleep(settings_for_game.rate_limit_rpm)

			if no_new_found:
				# Final user-friendly message already logged above; summarize with saved count
				self.progress.log(f"Finished: skipped scraping for {game.name} (no new reviews). Saved {saved_count} new reviews in this run.")
			else:
				self.progress.log(f"Scrape complete for {game.name} (saved {saved_count} new reviews)")
		finally:
			await client.aclose()

	async def _save_reviews(
		self,
		app_id: int,
		reviews: List[Dict[str, Any]],
		settings_for_game: ScrapeSettings,
		threshold_start: Optional[datetime],
		max_to_save: Optional[int] = None,
	) -> int:
		"""Apply filters and persist reviews. Return number saved."""
		# Normalize comparison baselines to naive UTC to match DB storage
		if threshold_start and threshold_start.tzinfo is not None:
			threshold_start = threshold_start.replace(tzinfo=None)
		end_date_cmp: Optional[datetime] = settings_for_game.end_date
		if end_date_cmp and end_date_cmp.tzinfo is not None:
			end_date_cmp = end_date_cmp.replace(tzinfo=None)

		db: Session = SessionLocal()
		saved = 0
		try:
			for r in reviews:
				# Respect per-call cap if requested
				if max_to_save is not None and saved >= max_to_save:
					break
				raw_recommendationid = r.get("recommendationid")
				if raw_recommendationid is None:
					continue
				review_id = str(raw_recommendationid)

				review_text = r.get("review") or ""
				ts = r.get("timestamp_created")
				if ts is None:
					# Skip reviews without a timestamp
					continue
				review_date_aware = utc_from_unix(int(ts))
				review_date = review_date_aware.replace(tzinfo=None)
				playtime_minutes = (r.get("author") or {}).get("playtime_forever") or 0
				playtime_hours = float(playtime_minutes) / 60.0
				review_type = "positive" if r.get("voted_up") else "negative"
				language = (r.get("language") or settings_for_game.language).lower()
				early_access = bool(r.get("written_during_early_access"))
				received_for_free = bool(r.get("received_for_free"))

				# Filters
				if threshold_start and review_date < threshold_start:
					continue
				if end_date_cmp and review_date > end_date_cmp:
					continue
				# Playtime filters (hours)
				min_pt = settings_for_game.min_playtime
				max_pt = settings_for_game.max_playtime
				if min_pt is not None and playtime_hours < float(min_pt):
					continue
				if max_pt is not None and playtime_hours > float(max_pt):
					continue
				if settings_for_game.early_access == "exclude" and early_access:
					continue
				if settings_for_game.early_access == "only" and not early_access:
					continue
				if settings_for_game.received_for_free == "exclude" and received_for_free:
					continue
				if settings_for_game.received_for_free == "only" and not received_for_free:
					continue

				# Skip duplicates
				existing = db.get(models.Review, review_id)
				if existing:
					continue

				obj = models.Review(
					review_id=review_id,
					app_id=app_id,
					review_text=review_text,
					review_date=review_date,
					playtime_hours=playtime_hours,
					review_type=review_type,
					language=language,
					early_access=early_access,
					received_for_free=received_for_free,
					# Additional fields from Steam payload
					timestamp_updated=(utc_from_unix(int(r.get("timestamp_updated"))) if r.get("timestamp_updated") is not None else None),
					votes_helpful=(r.get("votes_helpful") if r.get("votes_helpful") is not None else None),
					weighted_vote_score=(r.get("weighted_vote_score") if r.get("weighted_vote_score") is not None else None),
					comment_count=(r.get("comment_count") if r.get("comment_count") is not None else None),
					author_num_games_owned=((r.get("author") or {}).get("num_games_owned") if (r.get("author") or {}).get("num_games_owned") is not None else None),
					author_num_reviews=((r.get("author") or {}).get("num_reviews") if (r.get("author") or {}).get("num_reviews") is not None else None),
					author_playtime_last_two_weeks=((r.get("author") or {}).get("playtime_last_two_weeks") if (r.get("author") or {}).get("playtime_last_two_weeks") is not None else None),
					author_last_played=(utc_from_unix(int((r.get("author") or {}).get("last_played"))) if (r.get("author") or {}).get("last_played") is not None else None),
					steam_purchase=(bool(r.get("steam_purchase")) if r.get("steam_purchase") is not None else None),
				)
				db.add(obj)
				saved += 1

			# Commit per batch
			db.commit()
			return saved
		except IntegrityError:
			db.rollback()
			return saved
		finally:
			db.close()


scraper_service = ScraperService()


