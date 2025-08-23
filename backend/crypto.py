import base64
from cryptography.fernet import Fernet

# NOTE: For now we persist a key to disk or environment; later we can integrate OS key store.
# This module provides simple encrypt/decrypt wrappers. The stored key should be protected.

_FERNET_KEY = None

def load_key_from_env_or_file() -> bytes:
    global _FERNET_KEY
    if _FERNET_KEY:
        return _FERNET_KEY
    import os

    key = os.environ.get("RAT_FERNET_KEY")
    if key:
        _FERNET_KEY = base64.urlsafe_b64decode(key)
        return _FERNET_KEY
    # fallback: look for a local file
    p = os.environ.get("RAT_FERNET_KEY_FILE", "./.rat_fernet_key")
    try:
        with open(p, "rb") as fh:
            k = fh.read().strip()
            _FERNET_KEY = k
            return _FERNET_KEY
    except Exception:
        # auto-generate and store
        k = Fernet.generate_key()
        try:
            with open(p, "wb") as fh:
                fh.write(k)
        except Exception:
            pass
        _FERNET_KEY = k
        return _FERNET_KEY


def encrypt_key(plaintext: str) -> str:
    k = load_key_from_env_or_file()
    f = Fernet(k)
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_key(token: str) -> str:
    k = load_key_from_env_or_file()
    f = Fernet(k)
    return f.decrypt(token.encode("utf-8")).decode("utf-8")


