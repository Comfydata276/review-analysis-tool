from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from ..database import get_db
from .. import crud
from ..crypto import encrypt_key, decrypt_key
from ..schemas import ApiKeyCreate, ApiKeyRead
from typing import Any
from fastapi import Body

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


@router.get("/analysis")
def get_analysis_settings(db: Session = Depends(get_db)) -> Any:
    s = crud.get_setting(db, "analysis:settings")
    if not s:
        return {}
    try:
        import json

        return json.loads(s.value)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse settings")


@router.post("/analysis")
def post_analysis_settings(payload: Any = Body(...), db: Session = Depends(get_db)) -> Any:
    try:
        import json

        raw = json.dumps(payload)
        s = crud.upsert_setting(db, "analysis:settings", raw)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/analysis")
def delete_analysis_settings(db: Session = Depends(get_db)) -> Any:
    ok = crud.delete_setting(db, "analysis:settings")
    return {"ok": ok}


@router.get("/llm-config")
def get_llm_config(db: Session = Depends(get_db)) -> Any:
    s = crud.get_setting(db, "llm:config")
    if not s:
        return {}
    try:
        import json

        return json.loads(s.value)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse settings")


@router.post("/llm-config")
def post_llm_config(payload: Any = Body(...), db: Session = Depends(get_db)) -> Any:
    try:
        import json

        raw = json.dumps(payload)
        s = crud.upsert_setting(db, "llm:config", raw)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api-keys", response_model=ApiKeyRead)
def create_api_key(payload: ApiKeyCreate = Body(...), db: Session = Depends(get_db)) -> Any:
    try:
        # Basic provider-specific key format validation
        prov = str(payload.provider or "").lower()
        raw = payload.encrypted_key or ""
        if prov == 'openai' and not (raw.startswith('sk-') or raw.startswith('oai-') or len(raw) > 30):
            raise HTTPException(status_code=400, detail="Unrecognized OpenAI key format")
        if prov == 'openrouter' and not raw.startswith('sk-or-'):
            raise HTTPException(status_code=400, detail="Unrecognized OpenRouter key format")
        if prov == 'anthropic' and not raw.startswith('sk-ant-'):
            raise HTTPException(status_code=400, detail="Unrecognized Anthropic key format")
        if prov == 'google' and not raw.startswith('AIza'):
            raise HTTPException(status_code=400, detail="Unrecognized Google API key format")

        enc = encrypt_key(raw)
        k = crud.create_api_key(db, payload.provider, enc, payload.name, payload.notes)
        return ApiKeyRead.from_orm(k)
    except HTTPException:
        # propagate HTTP errors as-is
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api-keys")
def list_api_keys(db: Session = Depends(get_db)) -> Any:
    keys = crud.list_api_keys(db)
    # return non-sensitive metadata only
    return [ApiKeyRead.from_orm(k) for k in keys]


@router.get("/api-keys/{key_id}")
def get_api_key(key_id: int, db: Session = Depends(get_db)) -> Any:
    k = crud.get_api_key(db, key_id)
    if not k:
        raise HTTPException(status_code=404, detail="Not found")
    # For security, do not return decrypted key material via this endpoint.
    # Return metadata only; if a consumer needs the raw key, provide a secure export flow.
    return ApiKeyRead.from_orm(k)


@router.delete("/api-keys/{key_id}")
def delete_api_key(key_id: int, db: Session = Depends(get_db)) -> Any:
    ok = crud.delete_api_key(db, key_id)
    return {"ok": ok}


@router.post("/api-keys/{key_id}")
def update_api_key(key_id: int, payload: Any = Body(...), db: Session = Depends(get_db)) -> Any:
    try:
        enc = None
        # only encrypt if rotating/providing a new key
        if payload.get("encrypted_key"):
            # Determine provider: prefer payload provider, fall back to DB-stored provider
            prov = payload.get('provider')
            if not prov:
                existing = crud.get_api_key(db, key_id)
                prov = getattr(existing, 'provider', None) if existing else None
            p = str(prov or '').lower()
            raw = payload.get('encrypted_key') or ''
            if p == 'openai' and not (raw.startswith('sk-') or raw.startswith('oai-') or len(raw) > 30):
                raise HTTPException(status_code=400, detail="Unrecognized OpenAI key format")
            if p == 'openrouter' and not raw.startswith('sk-or-'):
                raise HTTPException(status_code=400, detail="Unrecognized OpenRouter key format")
            if p == 'anthropic' and not raw.startswith('sk-ant-'):
                raise HTTPException(status_code=400, detail="Unrecognized Anthropic key format")
            if p == 'google' and not raw.startswith('AIza'):
                raise HTTPException(status_code=400, detail="Unrecognized Google API key format")

            enc = encrypt_key(raw)
        k = crud.update_api_key(db, key_id, encrypted_key=enc, name=payload.get("name"), notes=payload.get("notes"), provider=payload.get("provider"))
        if not k:
            raise HTTPException(status_code=404, detail="Not found")
        return {"ok": True}
    except HTTPException:
        # propagate HTTP errors as-is
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

