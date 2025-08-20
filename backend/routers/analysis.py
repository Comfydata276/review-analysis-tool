from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from .. import models, schemas

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


