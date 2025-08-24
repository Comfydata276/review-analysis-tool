from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import io
import csv
try:
    from openpyxl import Workbook
except Exception:
    Workbook = None  # openpyxl may not be installed in all environments
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas
from sqlalchemy.orm import Session
from .. import crud
from fastapi import BackgroundTasks
from ..analysis.registry import get_provider_for_name
from typing import Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from ..analysis.mappers import get_mapper_for_name

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/preview", response_model=schemas.ReviewPage)
def preview_analysis(payload: dict, db: Session = Depends(get_db)):
    """Return a preview sample of reviews that match the provided analysis filters.

    This endpoint does not call any LLM providers. It is intended to allow the frontend
    to preview which reviews will be analyzed.
    """
    # Build query similar to /reviews endpoint but accept a POST body with filter keys
    q = db.query(models.Review)

    app_id = payload.get("app_id")
    if app_id is not None:
        q = q.filter(models.Review.app_id == int(app_id))

    # Date filters expected as YYYY-MM-DD
    from datetime import datetime, timezone

    start_date = payload.get("start_date")
    end_date = payload.get("end_date")
    if start_date:
        sd = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        q = q.filter(models.Review.review_date >= sd)
    if end_date:
        ed = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        q = q.filter(models.Review.review_date <= ed)

    review_type = payload.get("review_type")
    if review_type is not None:
        q = q.filter(models.Review.review_type == review_type)

    # playtime filters
    min_playtime = payload.get("min_playtime")
    max_playtime = payload.get("max_playtime")
    if min_playtime is not None:
        q = q.filter(models.Review.playtime_hours >= float(min_playtime))
    if max_playtime is not None:
        q = q.filter(models.Review.playtime_hours <= float(max_playtime))

    # early access / received for free
    early_access = payload.get("early_access")
    if early_access == "only":
        q = q.filter(models.Review.early_access == True)
    elif early_access == "exclude":
        q = q.filter(models.Review.early_access == False)

    received_for_free = payload.get("received_for_free")
    if received_for_free == "only":
        q = q.filter(models.Review.received_for_free == True)
    elif received_for_free == "exclude":
        q = q.filter(models.Review.received_for_free == False)

    # language
    language = payload.get("language")
    if language and language != "Any":
        # Do a case-insensitive match for language values stored in DB
        try:
            q = q.filter(func.lower(models.Review.language) == language.lower())
        except Exception:
            q = q.filter(models.Review.language == language)

    # limit/offset - default to sample of 50 for preview
    limit = int(payload.get("limit", 50))
    offset = int(payload.get("offset", 0))

    total = q.with_entities(func.count()).scalar() or 0
    items = q.order_by(models.Review.review_date.desc()).offset(offset).limit(limit).all()

    return schemas.ReviewPage(reviews=items, total=total, limit=limit, offset=offset)


@router.post("/start")
def start_analysis(payload: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> Any:
    """Start an analysis job. Payload should include filters and provider settings.

    This endpoint creates an `analysis_jobs` record and schedules background processing.
    """
    # create job
    job = crud.create_analysis_job(db, type("J", (), {"name": payload.get("name"), "app_id": payload.get("app_id"), "settings": str(payload.get("settings")), "provider_list": str(payload.get("providers"))}))
    # schedule background task
    background_tasks.add_task(_run_analysis_job, job.id, payload)
    return {"job_id": job.id}


def _run_analysis_job(job_id: int, payload: dict):
    # This is a simple worker. We'll dispatch batches via ThreadPoolExecutor for cloud providers.
    db = next(get_db())
    job = crud.get_analysis_job(db, job_id)
    if not job:
        return
    try:
        # load active prompt
        s = crud.get_setting(db, "prompts:active")
        prompt_name = s.value if s else "prompt.txt"
        from pathlib import Path
        from ..config import settings as cfg

        p = Path(cfg.PROMPTS_DIR) / prompt_name
        prompt_text = p.read_text() if p.exists() else ""

        # fetch reviews via same query logic as preview
        resp = preview_analysis(payload, db)
        reviews = resp.reviews

        # choose provider
        provider_name = payload.get("provider", "openai")
        provider = get_provider_for_name(db, provider_name)

        # batching params
        reviews_per_batch = int(payload.get("reviews_per_batch", 5))
        batches_per_request = int(payload.get("batches_per_request", 1))

        # create analysis_result rows
        for r in reviews:
            ar = crud.create_analysis_result(db, type("R", (), {"job_id": job.id, "app_id": r.app_id, "game_name": getattr(r, "game_name", None), "review_id": r.review_id, "review_text_snapshot": r.review_text, "llm_provider": provider_name, "model": payload.get("model", "gpt-5"), "reasoning_effort": payload.get("reasoning", {}).get("effort") if payload.get("reasoning") else None, "prompt_used": prompt_text}))
        # set total_reviews on the job so UI can display progress
        try:
            job.total_reviews = len(reviews)
            job.started_at = func.now()
            db.add(job)
            db.commit()
        except Exception:
            db.rollback()
        # process in batches
        results = db.query(models.AnalysisResult).filter(models.AnalysisResult.job_id == job.id).all()
        reviews_per_batch = int(payload.get("reviews_per_batch", 5))
        batches = [results[i : i + reviews_per_batch] for i in range(0, len(results), reviews_per_batch)]

        def process_batch(batch):
            outs = []
            inputs = [b.review_text_snapshot or "" for b in batch]
            if hasattr(provider, "analyze_batch"):
                # progress callback updates the AnalysisJob.processed_count periodically
                # capture baseline processed_count so progress counts are incremental
                # track whether provider progress_cb reported progress for this batch
                progress_reported = {"val": False}
                try:
                    db_for_baseline = next(get_db())
                    j_baseline = crud.get_analysis_job(db_for_baseline, job.id)
                    baseline_count = int(j_baseline.processed_count or 0) if j_baseline else 0
                except Exception:
                    baseline_count = 0

                def progress_cb(completed: int, total: int):
                    try:
                        db_local = next(get_db())
                        j = crud.get_analysis_job(db_local, job.id)
                        if j:
                            # set processed_count as baseline + completed for this batch
                            j.processed_count = int(baseline_count + (completed or 0))
                            # only set total if provided to avoid overwriting
                            if total:
                                j.total_reviews = int(total)
                            db_local.add(j)
                            db_local.commit()
                            progress_reported["val"] = True
                    except Exception:
                        try:
                            db_local.rollback()
                        except Exception:
                            pass

                resp = provider.analyze_batch(
                    inputs,
                    batch[0].prompt_used if batch else "",
                    batch[0].model if batch else payload.get("model", "gpt-5"),
                    {"effort": batch[0].reasoning_effort} if batch and batch[0].reasoning_effort else None,
                    "24h",
                    progress_cb,
                )
                outs = resp
            else:
                for idx, inp in enumerate(inputs):
                    full_prompt = f"{batch[idx].prompt_used}\n\nReview:\n{inp}"
                    outs.append(provider.analyze_single(full_prompt, batch[idx].model, {"reasoning": {"effort": batch[idx].reasoning_effort}}))
            # persist outputs
            db_local = next(get_db())
            for i, b in enumerate(batch):
                try:
                    # persist raw output object (dict) when possible so mappers can parse
                    crud.update_analysis_result_output(db_local, b.id, outs[i])
                except Exception:
                    pass
            # after persisting this batch, increment processed_count if provider didn't report progress
            try:
                if not progress_reported.get("val", False):
                    db_local = next(get_db())
                    j = crud.get_analysis_job(db_local, job.id)
                    if j:
                        j.processed_count = min(j.total_reviews or 0, (j.processed_count or 0) + len(batch))
                        db_local.add(j)
                        db_local.commit()
            except Exception:
                try:
                    db_local.rollback()
                except Exception:
                    pass

        # concurrency control: batches_per_request
        batches_per_request = int(payload.get("batches_per_request", 1))
        if batches_per_request > 1:
            with ThreadPoolExecutor(max_workers=batches_per_request) as ex:
                futures = [ex.submit(process_batch, batch) for batch in batches]
                for _ in as_completed(futures):
                    pass
        else:
            for batch in batches:
                process_batch(batch)
        job.status = "completed"
        db.add(job)
        db.commit()
    except Exception as e:
        job.status = "error"
        job.error = str(e)
        db.add(job)
        db.commit()



@router.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = crud.list_analysis_jobs(db)
    return [schemas.AnalysisJobRead.from_orm(j) for j in jobs]


@router.get("/jobs/{job_id}/results")
def get_job_results(job_id: int, db: Session = Depends(get_db)):
    res = crud.list_analysis_results_for_job(db, job_id)
    return [schemas.AnalysisResultRead.from_orm(r) for r in res]


@router.get("/results", response_model=List[schemas.AnalysisResultRead])
def list_analysis_results(
    job_id: Optional[int] = None,
    app_id: Optional[int] = None,
    review_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """List analysis results with optional filters for job_id, app_id, review_id, and status."""
    q = db.query(models.AnalysisResult)
    if job_id is not None:
        q = q.filter(models.AnalysisResult.job_id == job_id)
    if app_id is not None:
        q = q.filter(models.AnalysisResult.app_id == app_id)
    if review_id is not None:
        q = q.filter(models.AnalysisResult.review_id == review_id)
    if status is not None:
        q = q.filter(models.AnalysisResult.status == status)

    items = q.order_by(models.AnalysisResult.created_at.asc()).offset(offset).limit(limit).all()
    return [schemas.AnalysisResultRead.from_orm(r) for r in items]


@router.post("/backfill")
def backfill_analysis_results(limit: int = 1000, db: Session = Depends(get_db)):
    """Backfill existing analysis_result rows by parsing `analysis_output` with provider mappers.

    Scans up to `limit` rows where `analysed_review` is NULL but `analysis_output` is present,
    runs the provider mapper and updates the canonical fields. Returns count updated.
    """
    q = db.query(models.AnalysisResult).filter(models.AnalysisResult.analysed_review == None).filter(models.AnalysisResult.analysis_output != None).limit(limit)
    rows = q.all()
    updated = 0
    for r in rows:
        try:
            mapper = get_mapper_for_name(r.llm_provider)
            if mapper:
                mapped = mapper(r.analysis_output)
                if mapped:
                    if mapped.get("analysed_review") is not None:
                        r.analysed_review = mapped.get("analysed_review")
                    if mapped.get("input_tokens") is not None:
                        r.input_tokens = mapped.get("input_tokens")
                    if mapped.get("output_tokens") is not None:
                        r.output_tokens = mapped.get("output_tokens")
                    if mapped.get("total_tokens") is not None:
                        r.total_tokens = mapped.get("total_tokens")
                    if mapped.get("analysis_output") is not None:
                        r.analysis_output = mapped.get("analysis_output")
            # populate missing game_name from Review/Game if possible
            if not r.game_name and r.review_id:
                rev = db.query(models.Review).filter(models.Review.review_id == r.review_id).first()
                if rev:
                    g = db.query(models.Game).filter(models.Game.app_id == rev.app_id).first()
                    if g:
                        r.game_name = g.name
            db.add(r)
            updated += 1
        except Exception:
            continue
    db.commit()
    return {"updated": updated, "scanned": len(rows)}


@router.get("/results/{result_id}", response_model=schemas.AnalysisResultRead)
def get_analysis_result(result_id: int, db: Session = Depends(get_db)):
    """Fetch a single analysis result by id."""
    r = crud.get_analysis_result(db, result_id)
    if not r:
        raise HTTPException(status_code=404, detail="Analysis result not found")
    return schemas.AnalysisResultRead.from_orm(r)


@router.get("/export/{app_id}")
def export_analysis_results(app_id: int, format: str = "csv", db: Session = Depends(get_db)):
    """Export analysis results for an app_id as CSV or XLSX. Returns a file download."""
    q = db.query(models.AnalysisResult).filter(models.AnalysisResult.app_id == app_id).order_by(models.AnalysisResult.created_at.asc())
    rows = q.all()

    if not rows:
        raise HTTPException(status_code=404, detail="No analysis results found for given app_id")

    headers = [
        "id",
        "job_id",
        "app_id",
        "game_name",
        "review_id",
        "review_text_snapshot",
        "llm_provider",
        "model",
        "reasoning_effort",
        "prompt_used",
        "analysis_output",
        "analysed_review",
        "input_tokens",
        "output_tokens",
        "total_tokens",
        "status",
        "error",
        "created_at",
        "completed_at",
    ]

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for r in rows:
            writer.writerow([
                r.id,
                r.job_id,
                r.app_id,
                r.game_name or "",
                r.review_id or "",
                (r.review_text_snapshot or ""),
                r.llm_provider or "",
                r.model or "",
                r.reasoning_effort or "",
                (r.prompt_used or ""),
                (r.analysis_output or ""),
                r.analysed_review or "",
                r.input_tokens if r.input_tokens is not None else "",
                r.output_tokens if r.output_tokens is not None else "",
                r.total_tokens if r.total_tokens is not None else "",
                r.status or "",
                r.error or "",
                r.created_at.isoformat() if r.created_at is not None else "",
                r.completed_at.isoformat() if r.completed_at is not None else "",
            ])
        data = output.getvalue().encode("utf-8")
        output.close()
        filename = f"analysis_results_{app_id}.csv"
        return StreamingResponse(io.BytesIO(data), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})

    if format == "xlsx":
        if Workbook is None:
            raise HTTPException(status_code=500, detail="XLSX export not available: missing openpyxl dependency")
        wb = Workbook()
        ws = wb.active
        ws.append(headers)
        for r in rows:
            ws.append([
                r.id,
                r.job_id,
                r.app_id,
                r.game_name or "",
                r.review_id or "",
                (r.review_text_snapshot or ""),
                r.llm_provider or "",
                r.model or "",
                r.reasoning_effort or "",
                (r.prompt_used or ""),
                (r.analysis_output or ""),
                r.analysed_review or "",
                r.input_tokens if r.input_tokens is not None else "",
                r.output_tokens if r.output_tokens is not None else "",
                r.total_tokens if r.total_tokens is not None else "",
                r.status or "",
                r.error or "",
                r.created_at.isoformat() if r.created_at is not None else "",
                r.completed_at.isoformat() if r.completed_at is not None else "",
            ])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"analysis_results_{app_id}.xlsx"
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})

    raise HTTPException(status_code=400, detail="Unsupported format")


