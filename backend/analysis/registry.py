from typing import Optional
from sqlalchemy.orm import Session

from .. import models
from .. import crud
from ..crypto import decrypt_key
from .providers.openai_provider import OpenAIProvider


def get_provider_for_name(db: Session, provider_name: str):
    """Return an instantiated provider for the given provider_name.

    This looks up the first API key for the provider in the `api_keys` table,
    decrypts it, and returns a provider instance. Raise ValueError if not found.
    """
    key = db.query(models.ApiKey).filter(models.ApiKey.provider == provider_name).first()
    if not key:
        raise ValueError(f"No API key found for provider '{provider_name}'")
    api_key = decrypt_key(key.encrypted_key)
    if provider_name.lower() == "openai":
        return OpenAIProvider(api_key)
    # future providers
    raise ValueError(f"Unknown provider '{provider_name}'")


