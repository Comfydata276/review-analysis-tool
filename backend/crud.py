from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models, schemas


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


