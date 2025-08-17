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
	max_reviews: int
	rate_limit_rpm: int
	language: str
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
	requests_made: int = 0
	logs: List[str] = field(default_factory=list)
	stop_requested: bool = False

	def log(self, message: str) -> None:
		self.logs.append(f"{datetime.now(timezone.utc).isoformat()} {message}")
		if len(self.logs) > 100:
			self.logs = self.logs[-100:]

	def eta_seconds_current(self) -> int:
		if self.current_game_total <= 0 or self.avg_request_seconds <= 0:
			return 0
		remaining_reviews = max(self.current_game_total - self.current_game_scraped, 0)
		remaining_requests = (remaining_reviews + 99) // 100
		return int(remaining_requests * self.avg_request_seconds)

	def eta_seconds_global(self) -> int:
		if self.global_total <= 0 or self.avg_request_seconds <= 0:
			return 0
		remaining_reviews = max(self.global_total - self.global_scraped, 0)
		remaining_requests = (remaining_reviews + 99) // 100
		return int(remaining_requests * self.avg_request_seconds)


class ScraperService:
	def __init__(self) -> None:
		self._lock = asyncio.Lock()
		self._task: Optional[asyncio.Task] = None
		self.progress = Progress()

	async def start(self, settings_payload: Dict[str, Any]) -> None:
		async with self._lock:
			if self.progress.is_running:
				raise RuntimeError("Scraper already running")
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
				return ScrapeSettings(
					max_reviews=int(raw.get("max_reviews", 1000)),
					rate_limit_rpm=max(1, int(raw.get("rate_limit_rpm", 60))),
					language=str(raw.get("language", "english")),
					start_date=parse_date(raw.get("start_date"), end_of_day=False),
					end_date=parse_date(raw.get("end_date"), end_of_day=True),
					early_access=str(raw.get("early_access", "include")),
					received_for_free=str(raw.get("received_for_free", "include")),
				)

			g_settings = make_settings(global_settings)

			# Load active games
			db: Session = SessionLocal()
			try:
				active_games = crud.list_games(db)
			except Exception:
				db.close()
				raise

			# Initialize global total estimate as sum of per-game max (rough)
			self.progress.global_total = len(active_games) * g_settings.max_reviews
			self.progress.global_scraped = 0

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
		self.progress.current_game_scraped = 0
		self.progress.current_game_total = 0
		# set the user requested target for UI/progress (requested max reviews)
		self.progress.current_game_target = settings_for_game.max_reviews
		self.progress.log(f"Starting scrape for {game.name} ({game.app_id})")

		cursor = "*"
		saved_count = 0
		no_new_found = False
		# Load last saved cursor for this game (if any)
		# compute params hash to key cursors per app+params
		import hashlib, json
		params_key = {
			"language": settings_for_game.language,
			"start_date": settings_for_game.start_date.isoformat() if settings_for_game.start_date else None,
			"end_date": settings_for_game.end_date.isoformat() if settings_for_game.end_date else None,
			"early_access": settings_for_game.early_access,
			"received_for_free": settings_for_game.received_for_free,
		}
		params_hash = hashlib.sha256(json.dumps(params_key, sort_keys=True).encode()).hexdigest()

		db_cursor: Session = SessionLocal()
		try:
			row = db_cursor.query(models.ScrapeCursor).filter(models.ScrapeCursor.app_id == game.app_id, models.ScrapeCursor.params_hash == params_hash).first()
			saved_cursor = row.cursor if row is not None else None
		finally:
			db_cursor.close()
		# count consecutive duplicate/no-save pages seen when starting from newest
		consecutive_no_save_pages = 0
		DUPLICATE_PAGE_LIMIT = 3
		# when using saved cursor, track attempts (give up after a few)
		saved_cursor_attempts = 0
		MAX_SAVED_CURSOR_ATTEMPTS = 10
		used_saved_cursor = False
		client = httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS)
		try:
			# Determine resume threshold
			db: Session = SessionLocal()
			try:
				latest: Optional[datetime] = db.query(func.max(models.Review.review_date)).filter(models.Review.app_id == game.app_id).scalar()
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
				existing_db_count = int(q.scalar() or 0)
			finally:
				db2.close()

			# If already have enough reviews, skip scraping
			# Debug: log counts to help diagnose resume behavior
			self.progress.log(
				f"Resume check for {game.name}: latest_in_db={latest}, configured_start={configured_start}, existing_matches={existing_db_count}, requested_max={settings_for_game.max_reviews}"
			)
			remaining_needed = max(0, settings_for_game.max_reviews - existing_db_count)
			if remaining_needed <= 0:
				self.progress.current_game_scraped = existing_db_count
				self.progress.global_scraped += existing_db_count
				self.progress.log(f"No new reviews for '{game.name}' are avaliable. All reviews that meet the configuration settings have been gathered.")
				return

			# If user did not set a start_date and DB already has some reviews but fewer than requested,
			# allow scraping older pages by clearing the resume threshold.
			if configured_start is None and existing_db_count > 0 and remaining_needed > 0:
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
						self.progress.current_game_total = min(q_total, settings_for_game.max_reviews)
					else:
						# Fallback to requested max if store doesn't provide an estimate
						self.progress.current_game_total = settings_for_game.max_reviews
					# Adjust global total by replacing per-game rough estimate with the chosen estimate
					self.progress.global_total -= settings_for_game.max_reviews
					self.progress.global_total += self.progress.current_game_total

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
				remaining_needed -= saved_this_batch
				# Track duplicate/no-save pages when starting from newest; helps decide when to jump to saved cursor
				if saved_this_batch == 0:
					consecutive_no_save_pages += 1
				else:
					consecutive_no_save_pages = 0
				# Persist cursor for this app+params when we saved new reviews
				if saved_this_batch > 0:
					pc = payload.get("cursor")
					if pc:
						db_upd: Session = SessionLocal()
						try:
							row = db_upd.query(models.ScrapeCursor).filter(models.ScrapeCursor.app_id == game.app_id, models.ScrapeCursor.params_hash == params_hash).first()
							if row is None:
								row = models.ScrapeCursor(app_id=game.app_id, params_hash=params_hash, cursor=pc)
							else:
								row.cursor = pc
								row.updated_at = datetime.utcnow()
							db_upd.add(row)
							db_upd.commit()
						finally:
							db_upd.close()
				# If we've hit several consecutive duplicate/no-save pages, jump to the saved cursor (if available)
				if consecutive_no_save_pages >= DUPLICATE_PAGE_LIMIT and saved_cursor and not used_saved_cursor:
					if cursor != saved_cursor:
						self.progress.log(f"Detected {consecutive_no_save_pages} duplicate pages; jumping to saved cursor for {game.name}.")
						cursor = saved_cursor
						consecutive_no_save_pages = 0
						used_saved_cursor = True
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
				if remaining_needed <= 0:
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


