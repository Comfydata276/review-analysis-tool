from typing import Any, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from fastapi.params import Depends
from fastapi.responses import FileResponse
from pathlib import Path
from ..config import settings
from ..database import get_db
from sqlalchemy.orm import Session
from .. import crud
import os

router = APIRouter(prefix="/prompts", tags=["prompts"])


def prompts_dir() -> Path:
	p = Path(settings.PROMPTS_DIR)
	p.mkdir(parents=True, exist_ok=True)
	return p


@router.get("/")
def list_prompts() -> List[str]:
	p = prompts_dir()
	files = [f.name for f in p.iterdir() if f.is_file()]
	return files


@router.get("/active")
def get_active_prompt(db: Session = Depends(get_db)) -> Any:
	s = crud.get_setting(db, "prompts:active")
	if not s:
		return {"active": "prompt.txt"}
	return {"active": s.value}


@router.api_route("/active", methods=["POST", "PUT"])
def set_active_prompt(payload: Any = Body(...), db: Session = Depends(get_db)) -> Any:
	try:
		name = payload.get("name")
		if not name:
			raise HTTPException(status_code=400, detail="Missing name")
		p = prompts_dir() / name
		if not p.exists() or not p.is_file():
			raise HTTPException(status_code=404, detail="Not found")
		crud.upsert_setting(db, "prompts:active", name)
		return {"ok": True}
	except HTTPException:
		raise
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))


@router.api_route("/active/{name}", methods=["POST", "PUT"])
def set_active_prompt_by_name(name: str, db: Session = Depends(get_db)) -> Any:
	try:
		if not name:
			raise HTTPException(status_code=400, detail="Missing name")
		p = prompts_dir() / name
		if not p.exists() or not p.is_file():
			raise HTTPException(status_code=404, detail="Not found")
		crud.upsert_setting(db, "prompts:active", name)
		return {"ok": True}
	except HTTPException:
		raise
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))


@router.get("/{name}")
def get_prompt(name: str) -> Any:
	p = prompts_dir() / name
	if not p.exists() or not p.is_file():
		raise HTTPException(status_code=404, detail="Not found")
	# Disable caching so clients always fetch the latest contents
	return FileResponse(str(p), media_type="text/plain", filename=name, headers={"Cache-Control": "no-store"})


@router.post("/{name}")
def save_prompt(name: str, file: UploadFile = File(...), db: Session = Depends(get_db)) -> Any:
	p = prompts_dir() / name
	try:
		# Write atomically: write to a temp file then replace
		tmp = p.with_suffix('.tmp')
		with open(tmp, "wb") as fh:
			data = file.file.read()
			fh.write(data)
			fh.flush()
			try:
				os.fsync(fh.fileno())
			except Exception:
				# fsync may not be supported on some platforms; ignore if it fails
				pass
		os.replace(str(tmp), str(p))
		# if no active prompt is set, default to this one
		s = crud.get_setting(db, "prompts:active")
		if not s:
			crud.upsert_setting(db, "prompts:active", name)
		return {"ok": True}
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
def upload_prompt(file: UploadFile = File(...)) -> Any:
	p = prompts_dir() / file.filename
	try:
		tmp = p.with_suffix('.tmp')
		with open(tmp, "wb") as fh:
			data = file.file.read()
			fh.write(data)
			fh.flush()
			try:
				os.fsync(fh.fileno())
			except Exception:
				pass
		os.replace(str(tmp), str(p))
		return {"ok": True, "filename": file.filename}
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{name}")
def delete_prompt(name: str) -> Any:
	p = prompts_dir() / name
	if not p.exists() or not p.is_file():
		raise HTTPException(status_code=404, detail="Not found")
	try:
		p.unlink()
		return {"ok": True}
	except Exception as e:
		raise HTTPException(status_code=500, detail=str(e))

from typing import Any, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Body
from fastapi.params import Depends
from fastapi.responses import FileResponse
from pathlib import Path
from ..config import settings
from ..database import get_db
from sqlalchemy.orm import Session
from .. import crud
import os
from pydantic import BaseModel

router = APIRouter(prefix="/prompts", tags=["prompts"])


def prompts_dir() -> Path:
    p = Path(settings.PROMPTS_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


@router.get("/")
def list_prompts() -> List[str]:
    p = prompts_dir()
    files = [f.name for f in p.iterdir() if f.is_file()]
    return files


@router.get("/active")
def get_active_prompt_early(db: Session = Depends(get_db)) -> Any:
    s = crud.get_setting(db, "prompts:active")
    if not s:
        return {"active": "prompt.txt"}
    return {"active": s.value}


@router.post("/active/{name}")
def set_active_prompt_by_name_early(name: str, db: Session = Depends(get_db)) -> Any:
    try:
        if not name:
            raise HTTPException(status_code=400, detail="Missing name")
        p = prompts_dir() / name
        if not p.exists() or not p.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        crud.upsert_setting(db, "prompts:active", name)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active")
def get_active_prompt(db: Session = Depends(get_db)) -> Any:
    s = crud.get_setting(db, "prompts:active")
    if not s:
        # default active prompt
        return {"active": "prompt.txt"}
    return {"active": s.value}


@router.post("/active")
def set_active_prompt(payload: Any = Body(...), db: Session = Depends(get_db)) -> Any:
    try:
        name = payload.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Missing name")
        # ensure file exists
        p = prompts_dir() / name
        if not p.exists() or not p.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        crud.upsert_setting(db, "prompts:active", name)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/active/{name}")
def set_active_prompt_by_name(name: str, db: Session = Depends(get_db)) -> Any:
    try:
        if not name:
            raise HTTPException(status_code=400, detail="Missing name")
        p = prompts_dir() / name
        if not p.exists() or not p.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        crud.upsert_setting(db, "prompts:active", name)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.get("/{name}")
def get_prompt(name: str) -> Any:
    p = prompts_dir() / name
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    # Disable caching so clients always fetch the latest contents
    return FileResponse(str(p), media_type="text/plain", filename=name, headers={"Cache-Control": "no-store"})


@router.post("/{name}")
def save_prompt(name: str, file: UploadFile = File(...), db: Session = Depends(get_db)) -> Any:
    p = prompts_dir() / name
    try:
        # Write atomically: write to a temp file then replace
        tmp = p.with_suffix('.tmp')
        with open(tmp, "wb") as fh:
            data = file.file.read()
            fh.write(data)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except Exception:
                # fsync may not be supported on some platforms; ignore if it fails
                pass
        os.replace(str(tmp), str(p))
        # if no active prompt is set, default to this one
        s = crud.get_setting(db, "prompts:active")
        if not s:
            crud.upsert_setting(db, "prompts:active", name)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))





@router.post("/upload")
def upload_prompt(file: UploadFile = File(...)) -> Any:
    p = prompts_dir() / file.filename
    try:
        tmp = p.with_suffix('.tmp')
        with open(tmp, "wb") as fh:
            data = file.file.read()
            fh.write(data)
            fh.flush()
            try:
                os.fsync(fh.fileno())
            except Exception:
                pass
        os.replace(str(tmp), str(p))
        return {"ok": True, "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{name}")
def delete_prompt(name: str) -> Any:
    p = prompts_dir() / name
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    try:
        p.unlink()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/active")
def get_active_prompt(db: Session = Depends(get_db)) -> Any:
    s = crud.get_setting(db, "prompts:active")
    if not s:
        # default active prompt
        return {"active": "prompt.txt"}
    return {"active": s.value}


@router.post("/active")
def set_active_prompt(payload: Any = Body(...), db: Session = Depends(get_db)) -> Any:
    try:
        name = payload.get("name")
        if not name:
            raise HTTPException(status_code=400, detail="Missing name")
        # ensure file exists
        p = prompts_dir() / name
        if not p.exists() or not p.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        crud.upsert_setting(db, "prompts:active", name)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/active/{name}")
def set_active_prompt_by_name(name: str, db: Session = Depends(get_db)) -> Any:
    try:
        if not name:
            raise HTTPException(status_code=400, detail="Missing name")
        p = prompts_dir() / name
        if not p.exists() or not p.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        crud.upsert_setting(db, "prompts:active", name)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


