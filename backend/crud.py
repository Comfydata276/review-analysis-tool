from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models, schemas
from .analysis.mappers import get_mapper_for_name
import json


# Games
def get_game(db: Session, app_id: int) -> Optional[models.Game]:
	return db.query(models.Game).filter(models.Game.app_id == app_id).first()


def list_games(db: Session) -> List[models.Game]:
	return db.query(models.Game).order_by(models.Game.name.asc()).all()


def create_game(db: Session, game_in: schemas.GameCreate) -> models.Game:
	game = get_game(db, game_in.app_id)
	if game:
		return game
	game = models.Game(app_id=game_in.app_id, name=game_in.name)
	db.add(game)
	db.commit()
	db.refresh(game)
	return game


def delete_game(db: Session, app_id: int) -> bool:
	game = get_game(db, app_id)
	if not game:
		return False
	db.delete(game)
	db.commit()
	return True


def search_games_local(db: Session, query: str) -> List[models.Game]:
	"""Case-insensitive partial name match or exact AppID match."""
	query_normalized = query.strip()
	filters = []
	# Partial case-insensitive name match
	filters.append(func.lower(models.Game.name).like(f"%{query_normalized.lower()}%"))
	# Exact app_id match if query is int
	if query_normalized.isdigit():
		filters.append(models.Game.app_id == int(query_normalized))
	return (
		db.query(models.Game)
		.filter(or_(*filters))
		.order_by(models.Game.name.asc())
		.all()
	)


# Settings CRUD (simple key/value store)
def get_setting(db: Session, key: str) -> Optional[models.Setting]:
	return db.query(models.Setting).filter(models.Setting.key == key).first()


def upsert_setting(db: Session, key: str, value: str) -> models.Setting:
	s = get_setting(db, key)
	if s:
		s.value = value
		# use DB func.now() for updated_at
		s.updated_at = func.now()
		db.add(s)
		db.commit()
		db.refresh(s)
		return s
	# create new
	s2 = models.Setting(key=key, value=value)
	db.add(s2)
	db.commit()
	db.refresh(s2)
	return s2


def delete_setting(db: Session, key: str) -> bool:
	s = get_setting(db, key)
	if not s:
		return False
	db.delete(s)
	db.commit()
	return True


# Analysis jobs/results CRUD
def create_analysis_job(db: Session, job_in) -> models.AnalysisJob:
    job = models.AnalysisJob(
        name=getattr(job_in, "name", None),
        app_id=getattr(job_in, "app_id", None),
        settings=getattr(job_in, "settings", None),
        provider_list=getattr(job_in, "provider_list", None),
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_analysis_job(db: Session, job_id: int) -> Optional[models.AnalysisJob]:
    return db.query(models.AnalysisJob).filter(models.AnalysisJob.id == job_id).first()


def list_analysis_jobs(db: Session) -> List[models.AnalysisJob]:
    return db.query(models.AnalysisJob).order_by(models.AnalysisJob.started_at.desc()).all()


def create_analysis_result(db: Session, result_in) -> models.AnalysisResult:
    r = models.AnalysisResult(
        job_id=result_in.job_id,
        app_id=getattr(result_in, "app_id", None),
        game_name=getattr(result_in, "game_name", None),
        review_id=getattr(result_in, "review_id", None),
        review_text_snapshot=getattr(result_in, "review_text_snapshot", None),
        llm_provider=result_in.llm_provider,
        model=result_in.model,
        reasoning_effort=getattr(result_in, "reasoning_effort", None),
        prompt_used=getattr(result_in, "prompt_used", None),
        status="pending",
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def update_analysis_result_output(db: Session, result_id: int, output: str, status: str = "complete", error: Optional[str] = None):
    r = db.query(models.AnalysisResult).filter(models.AnalysisResult.id == result_id).first()
    if not r:
        return None
    # output may be a provider response dict or string; try provider-specific mapping
    r.analysis_output = output if isinstance(output, str) else json.dumps(output)
    try:
        mapper = get_mapper_for_name(r.llm_provider)
        if mapper:
            mapped = mapper(output)
            if mapped:
                # map fields if present
                if mapped.get("analysed_review") is not None:
                    r.analysed_review = mapped.get("analysed_review")
                if mapped.get("input_tokens") is not None:
                    r.input_tokens = mapped.get("input_tokens")
                if mapped.get("output_tokens") is not None:
                    r.output_tokens = mapped.get("output_tokens")
                if mapped.get("total_tokens") is not None:
                    r.total_tokens = mapped.get("total_tokens")
                # if mapper returned a canonical analysis_output, store that too
                if mapped.get("analysis_output") is not None:
                    r.analysis_output = mapped.get("analysis_output")
    except Exception:
        # ignore mapping errors
        pass
    r.status = status
    r.error = error
    r.completed_at = func.now()
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


# Api keys CRUD
def create_api_key(db: Session, provider: str, encrypted_key: str, name: Optional[str] = None, notes: Optional[str] = None) -> models.ApiKey:
    # mask last 6 chars of key for display
    try:
        decoded = decrypt_key(encrypted_key)
        mk = (decoded[-6:]).rjust(6, "*")
        masked = f"****{mk}"
    except Exception:
        masked = None
    k = models.ApiKey(provider=provider, encrypted_key=encrypted_key, name=name, notes=notes, masked_key=masked)
    db.add(k)
    db.commit()
    db.refresh(k)
    return k


def list_api_keys(db: Session) -> List[models.ApiKey]:
    return db.query(models.ApiKey).order_by(models.ApiKey.provider.asc(), models.ApiKey.name.asc()).all()


def get_api_key(db: Session, key_id: int) -> Optional[models.ApiKey]:
    return db.query(models.ApiKey).filter(models.ApiKey.id == key_id).first()


def delete_api_key(db: Session, key_id: int) -> bool:
    k = get_api_key(db, key_id)
    if not k:
        return False
    db.delete(k)
    db.commit()
    return True


def update_api_key(db: Session, key_id: int, *, encrypted_key: Optional[str] = None, name: Optional[str] = None, notes: Optional[str] = None, provider: Optional[str] = None) -> Optional[models.ApiKey]:
    k = get_api_key(db, key_id)
    if not k:
        return None
    if encrypted_key is not None:
        k.encrypted_key = encrypted_key
        # attempt to set masked_key if possible (decryption handled by caller)
    if name is not None:
        k.name = name
    if notes is not None:
        k.notes = notes
    if provider is not None:
        k.provider = provider
    k.updated_at = func.now()
    db.add(k)
    db.commit()
    db.refresh(k)
    return k


def list_analysis_results_for_job(db: Session, job_id: int) -> List[models.AnalysisResult]:
    return db.query(models.AnalysisResult).filter(models.AnalysisResult.job_id == job_id).order_by(models.AnalysisResult.created_at.asc()).all()


def get_analysis_result(db: Session, result_id: int) -> Optional[models.AnalysisResult]:
    return db.query(models.AnalysisResult).filter(models.AnalysisResult.id == result_id).first()



