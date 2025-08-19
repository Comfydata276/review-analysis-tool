from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas

import io
import csv
try:
    from openpyxl import Workbook
except Exception:
    Workbook = None  # openpyxl may not be installed in all environments


router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/", response_model=schemas.ReviewPage)
def list_reviews(
    app_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="YYYY-MM-DD"),
    review_type: Optional[str] = Query(None, description="positive|negative"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(models.Review)
    # Filters
    if app_id is not None:
        q = q.filter(models.Review.app_id == app_id)
    if review_type is not None:
        q = q.filter(models.Review.review_type == review_type)
    # Date parsing: expect YYYY-MM-DD strings
    from datetime import datetime, timezone

    if start_date:
        sd = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        q = q.filter(models.Review.review_date >= sd)
    if end_date:
        ed = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        q = q.filter(models.Review.review_date <= ed)

    total = q.with_entities(func.count()).scalar() or 0

    items = q.order_by(models.Review.review_date.desc()).offset(offset).limit(limit).all()

    return schemas.ReviewPage(reviews=items, total=total, limit=limit, offset=offset)


@router.delete("/by_game/{app_id}")
def delete_reviews_by_game(
    app_id: int,
    dry_run: bool = Query(False, description="If true, do not delete; only return count"),
    db: Session = Depends(get_db),
):
    """Delete all reviews for a given app_id. If dry_run=true, returns the count without deleting."""
    q = db.query(models.Review).filter(models.Review.app_id == app_id)
    count = q.with_entities(func.count()).scalar() or 0
    if dry_run:
        return {"app_id": app_id, "deleted_count": count, "dry_run": True}

    # Perform delete
    q.delete(synchronize_session=False)
    db.commit()
    return {"app_id": app_id, "deleted_count": count, "dry_run": False}



@router.get("/cursors")
def list_cursors(app_id: Optional[int] = Query(None), params_hash: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """List stored scrape cursors. Filter by `app_id` and/or `params_hash`."""
    q = db.query(models.ScrapeCursor)
    if app_id is not None:
        q = q.filter(models.ScrapeCursor.app_id == app_id)
    if params_hash is not None:
        q = q.filter(models.ScrapeCursor.params_hash == params_hash)
    rows = q.order_by(models.ScrapeCursor.updated_at.desc()).all()
    return [
        {
            "id": r.id,
            "app_id": r.app_id,
            "params_hash": r.params_hash,
            "cursor": r.cursor,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.delete("/cursors")
def delete_cursors(app_id: Optional[int] = Query(None), params_hash: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Delete stored cursors. Provide `app_id` or `params_hash` (or both)."""
    if app_id is None and params_hash is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Must provide app_id and/or params_hash to delete cursors")
    q = db.query(models.ScrapeCursor)
    if app_id is not None:
        q = q.filter(models.ScrapeCursor.app_id == app_id)
    if params_hash is not None:
        q = q.filter(models.ScrapeCursor.params_hash == params_hash)
    count = q.with_entities(func.count()).scalar() or 0
    q.delete(synchronize_session=False)
    db.commit()
    return {"deleted_count": count}



@router.get("/export/{app_id}")
def export_reviews(app_id: int, format: str = Query("csv", regex="^(csv|xlsx)$"), db: Session = Depends(get_db)):
    """Export all reviews for an `app_id` as CSV or XLSX. Returns a file download.

    Query params:
    - format: `csv` or `xlsx` (default: csv)
    """
    q = db.query(models.Review).filter(models.Review.app_id == app_id).order_by(models.Review.review_date.asc())
    rows = q.all()

    if not rows:
        raise HTTPException(status_code=404, detail="No reviews found for given app_id")

    # Export all fields present in the Review model
    headers = [
        "review_id",
        "app_id",
        "review_date",
        "review_text",
        "review_type",
        "language",
        "playtime_hours",
        "early_access",
        "received_for_free",
        "timestamp_updated",
        "votes_helpful",
        "weighted_vote_score",
        "comment_count",
        "author_num_games_owned",
        "author_num_reviews",
        "author_playtime_last_two_weeks",
        "author_last_played",
        "steam_purchase",
        "scraped_at",
    ]

    if format == "csv":
        # Build CSV in-memory
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for r in rows:
            writer.writerow([
                r.review_id,
                r.app_id,
                r.review_date.isoformat() if r.review_date is not None else "",
                (r.review_text or ""),
                r.review_type or "",
                r.language or "",
                r.playtime_hours if r.playtime_hours is not None else "",
                str(bool(r.early_access)),
                str(bool(r.received_for_free)),
                r.timestamp_updated.isoformat() if getattr(r, 'timestamp_updated', None) is not None else "",
                r.votes_helpful if getattr(r, 'votes_helpful', None) is not None else "",
                r.weighted_vote_score if getattr(r, 'weighted_vote_score', None) is not None else "",
                r.comment_count if getattr(r, 'comment_count', None) is not None else "",
                r.author_num_games_owned if getattr(r, 'author_num_games_owned', None) is not None else "",
                r.author_num_reviews if getattr(r, 'author_num_reviews', None) is not None else "",
                r.author_playtime_last_two_weeks if getattr(r, 'author_playtime_last_two_weeks', None) is not None else "",
                r.author_last_played.isoformat() if getattr(r, 'author_last_played', None) is not None else "",
                str(bool(r.steam_purchase)) if getattr(r, 'steam_purchase', None) is not None else "",
                r.scraped_at.isoformat() if r.scraped_at is not None else "",
            ])
        data = output.getvalue().encode("utf-8")
        output.close()
        filename = f"reviews_{app_id}.csv"
        return StreamingResponse(io.BytesIO(data), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})

    # XLSX export
    if format == "xlsx":
        if Workbook is None:
            raise HTTPException(status_code=500, detail="XLSX export not available: missing openpyxl dependency")
        wb = Workbook()
        ws = wb.active
        ws.append(headers)
        for r in rows:
            ws.append([
                r.review_id,
                r.app_id,
                r.review_date.isoformat() if r.review_date is not None else "",
                (r.review_text or ""),
                r.review_type or "",
                r.language or "",
                r.playtime_hours if r.playtime_hours is not None else "",
                str(bool(r.early_access)),
                str(bool(r.received_for_free)),
                r.timestamp_updated.isoformat() if getattr(r, 'timestamp_updated', None) is not None else "",
                r.votes_helpful if getattr(r, 'votes_helpful', None) is not None else "",
                r.weighted_vote_score if getattr(r, 'weighted_vote_score', None) is not None else "",
                r.comment_count if getattr(r, 'comment_count', None) is not None else "",
                r.author_num_games_owned if getattr(r, 'author_num_games_owned', None) is not None else "",
                r.author_num_reviews if getattr(r, 'author_num_reviews', None) is not None else "",
                r.author_playtime_last_two_weeks if getattr(r, 'author_playtime_last_two_weeks', None) is not None else "",
                r.author_last_played.isoformat() if getattr(r, 'author_last_played', None) is not None else "",
                str(bool(r.steam_purchase)) if getattr(r, 'steam_purchase', None) is not None else "",
                r.scraped_at.isoformat() if r.scraped_at is not None else "",
            ])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        filename = f"reviews_{app_id}.xlsx"
        return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f"attachment; filename=\"{filename}\""})


@router.get("/count/{app_id}")
def count_reviews_for_game(app_id: int, db: Session = Depends(get_db)):
    """Return the number of reviews stored in the DB for a given app_id."""
    q = db.query(models.Review).filter(models.Review.app_id == app_id)
    count = q.with_entities(func.count()).scalar() or 0
    return {"app_id": app_id, "count": int(count)}



