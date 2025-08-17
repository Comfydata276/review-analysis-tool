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
	scraped_at = Column(DateTime, default=datetime.utcnow, nullable=False)

	game = relationship("Game", back_populates="reviews")


class ScrapeCursor(Base):
    __tablename__ = "scrape_cursors"

    id = Column(Integer, primary_key=True, index=True)
    app_id = Column(Integer, nullable=False, index=True)
    params_hash = Column(String, nullable=False, index=True)
    cursor = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)


