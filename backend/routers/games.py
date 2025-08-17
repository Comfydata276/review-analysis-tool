from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from .. import steam_api


router = APIRouter(prefix="/games", tags=["games"])


@router.get("/search", response_model=schemas.GameSearchResponse)
async def search_games(
	query: str = Query(..., min_length=1),
	start: int = Query(0, ge=0),
	# allow larger result windows so clients can request more matches
	count: int = Query(50, ge=1, le=1000),
	db: Session = Depends(get_db),
):
	# Query Steam real-time with paging; do not persist search results
	results = await steam_api.search_games_realtime(query, start=start, count=count)
	# Return as paginated GameSearchResponse. The Steam storesearch endpoint does not
	# provide a reliable total count, so we return the number of games fetched in `total`.
	games = [schemas.GameCreate(app_id=int(r["app_id"]), name=r["name"]) for r in results]
	return schemas.GameSearchResponse(games=games, total=len(games), start=start, count=count)


@router.get("/active", response_model=List[schemas.GameRead])
def list_active_games(db: Session = Depends(get_db)):
	return crud.list_games(db)


@router.post("/active", response_model=schemas.GameRead, status_code=201)
def add_active_game(game_in: schemas.GameCreate, db: Session = Depends(get_db)):
	game = crud.create_game(db, game_in)
	return game


@router.delete("/active/{app_id}", status_code=204)
def remove_active_game(app_id: int, db: Session = Depends(get_db)):
	success = crud.delete_game(db, app_id)
	if not success:
		raise HTTPException(status_code=404, detail="Game not found")
	return None


