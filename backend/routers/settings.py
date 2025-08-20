from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from ..database import get_db
from .. import crud

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/scraper")
def get_scraper_settings(db: Session = Depends(get_db)) -> Any:
    s = crud.get_setting(db, "scraper:settings")
    if not s:
        return {}
    try:
        import json

        return json.loads(s.value)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse settings")


@router.post("/scraper")
def post_scraper_settings(payload: Any = Body(...), db: Session = Depends(get_db)) -> Any:
    try:
        import json

        raw = json.dumps(payload)
        s = crud.upsert_setting(db, "scraper:settings", raw)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/scraper")
def delete_scraper_settings(db: Session = Depends(get_db)) -> Any:
    ok = crud.delete_setting(db, "scraper:settings")
    return {"ok": ok}


