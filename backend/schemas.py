from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field
from pydantic.config import ConfigDict


class GameBase(BaseModel):
	app_id: int = Field(..., alias="app_id")
	name: str

	model_config = ConfigDict(populate_by_name=True)


class GameCreate(GameBase):
	pass


class GameRead(GameBase):
	added_at: datetime
	last_scraped_at: Optional[datetime] = None

	model_config = ConfigDict(from_attributes=True)


class ReviewBase(BaseModel):
	review_id: str
	app_id: int
	review_text: str
	review_date: datetime
	playtime_hours: Optional[float] = None
	review_type: str
	language: str
	early_access: bool = False
	received_for_free: bool = False
	# Additional Steam fields
	timestamp_updated: Optional[datetime] = None
	votes_helpful: Optional[int] = None
	weighted_vote_score: Optional[float] = None
	comment_count: Optional[int] = None
	author_num_games_owned: Optional[int] = None
	author_num_reviews: Optional[int] = None
	author_playtime_last_two_weeks: Optional[float] = None
	author_last_played: Optional[datetime] = None
	steam_purchase: Optional[bool] = None


class ReviewCreate(ReviewBase):
	pass


class ReviewRead(ReviewBase):
	scraped_at: datetime

	model_config = ConfigDict(from_attributes=True)


class ReviewPage(BaseModel):
    """Paginated container for review results with metadata."""
    reviews: List[ReviewRead]
    total: int
    limit: int
    offset: int

    model_config = ConfigDict(from_attributes=True)


class GameSearchResponse(BaseModel):
    """Paginated container for game search results."""
    games: List[GameCreate]
    total: Optional[int] = None
    start: int
    count: int

    model_config = ConfigDict(from_attributes=True)


