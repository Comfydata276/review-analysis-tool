from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas


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



