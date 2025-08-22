import os
from typing import Optional


class Settings:
	"""Application configuration pulled from environment variables."""

	# Database
	DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./app.db")

	# Steam API
	STEAM_API_BASE_URL: str = os.getenv(
		"STEAM_API_BASE_URL", "https://api.steampowered.com"
	)
	STEAM_API_KEY: Optional[str] = os.getenv("STEAM_API_KEY")

	# App behavior
	REQUEST_TIMEOUT_SECONDS: int = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "20"))

	# Prompts storage directory (not hard-coded; can be overridden via env)
	PROMPTS_DIR: str = os.getenv("PROMPTS_DIR", "./prompts")


settings = Settings()


