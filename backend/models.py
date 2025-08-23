from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Game(Base):
	__tablename__ = "games"

	app_id = Column(Integer, primary_key=True, index=True)
	name = Column(String, index=True, nullable=False)
	added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
	last_scraped_at = Column(DateTime, nullable=True)
	last_scraped_cursor = Column(String, nullable=True)

	reviews = relationship("Review", back_populates="game", cascade="all, delete-orphan")


class Review(Base):
	__tablename__ = "reviews"

	review_id = Column(String, primary_key=True, index=True)
	app_id = Column(Integer, ForeignKey("games.app_id"), nullable=False, index=True)
	review_text = Column(Text, nullable=False)
	review_date = Column(DateTime, nullable=False)
	playtime_hours = Column(Float, nullable=True)
	review_type = Column(String, nullable=False)
	language = Column(String, nullable=False)
	early_access = Column(Boolean, default=False, nullable=False)
	received_for_free = Column(Boolean, default=False, nullable=False)
	# Additional Steam fields
	timestamp_updated = Column(DateTime, nullable=True)
	votes_helpful = Column(Integer, nullable=True)
	weighted_vote_score = Column(Float, nullable=True)
	comment_count = Column(Integer, nullable=True)
	author_num_games_owned = Column(Integer, nullable=True)
	author_num_reviews = Column(Integer, nullable=True)
	author_playtime_last_two_weeks = Column(Float, nullable=True)
	author_last_played = Column(DateTime, nullable=True)
	steam_purchase = Column(Boolean, nullable=True)
	scraped_at = Column(DateTime, default=datetime.utcnow, nullable=False)

	game = relationship("Game", back_populates="reviews")



class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=True)
    app_id = Column(Integer, nullable=True, index=True)
    settings = Column(Text, nullable=True)
    provider_list = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending")
    total_reviews = Column(Integer, nullable=False, default=0)
    processed_count = Column(Integer, nullable=False, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)

    results = relationship("AnalysisResult", back_populates="job", cascade="all, delete-orphan")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    job_id = Column(Integer, ForeignKey("analysis_jobs.id"), nullable=False, index=True)
    app_id = Column(Integer, nullable=True, index=True)
    game_name = Column(String, nullable=True)
    review_id = Column(String, ForeignKey("reviews.review_id"), nullable=True, index=True)
    review_text_snapshot = Column(Text, nullable=True)

    llm_provider = Column(String, nullable=False)
    model = Column(String, nullable=False)
    reasoning_effort = Column(String, nullable=True)
    prompt_used = Column(Text, nullable=True)
    analysis_output = Column(Text, nullable=True)
    analysed_review = Column(Text, nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="pending")
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)

    job = relationship("AnalysisJob", back_populates="results")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    provider = Column(String, nullable=False, index=True)
    name = Column(String, nullable=True)
    encrypted_key = Column(Text, nullable=False)
    masked_key = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes = Column(Text, nullable=True)
