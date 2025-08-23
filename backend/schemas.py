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


class AnalysisJobBase(BaseModel):
    name: Optional[str] = None
    app_id: Optional[int] = None
    settings: Optional[str] = None
    provider_list: Optional[str] = None


class AnalysisJobCreate(AnalysisJobBase):
    pass


class AnalysisJobRead(AnalysisJobBase):
    id: int
    status: str
    total_reviews: int
    processed_count: int
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AnalysisResultBase(BaseModel):
    job_id: int
    app_id: Optional[int] = None
    game_name: Optional[str] = None
    review_id: Optional[str] = None
    review_text_snapshot: Optional[str] = None
    llm_provider: str
    model: str
    reasoning_effort: Optional[str] = None
    prompt_used: Optional[str] = None


class AnalysisResultCreate(AnalysisResultBase):
    pass


class AnalysisResultRead(AnalysisResultBase):
    id: int
    analysis_output: Optional[str] = None
    analysed_review: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    status: str
    error: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ApiKeyBase(BaseModel):
    provider: str
    name: Optional[str] = None
    notes: Optional[str] = None


class ApiKeyCreate(ApiKeyBase):
    encrypted_key: str


class ApiKeyRead(ApiKeyBase):
    id: int
    created_at: datetime
    updated_at: datetime
    masked_key: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class GameSearchResponse(BaseModel):
    """Paginated container for game search results."""
    games: List[GameCreate]
    total: Optional[int] = None
    start: int
    count: int

    model_config = ConfigDict(from_attributes=True)


