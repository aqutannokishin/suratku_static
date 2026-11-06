"""Hash password (argon2) dan penjaga login brute-force sederhana."""
import time
from collections import defaultdict

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

_ph = PasswordHasher()

MIN_PASSWORD_LEN = 8


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(hash_: str, password: str) -> bool:
    try:
        return _ph.verify(hash_, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def check_new_password(password: str) -> str | None:
    """Kembalikan pesan error, atau None kalau password layak."""
    if len(password) < MIN_PASSWORD_LEN:
        return f"Password minimal {MIN_PASSWORD_LEN} karakter."
    return None


# --- penjaga login: maksimal 5 gagal per 10 menit per username ----------------
_FAILS: dict[str, list[float]] = defaultdict(list)
MAX_FAILS = 5
WINDOW_SECONDS = 600


def too_many_fails(username: str) -> bool:
    now = time.time()
    _FAILS[username] = [t for t in _FAILS[username] if now - t < WINDOW_SECONDS]
    return len(_FAILS[username]) >= MAX_FAILS


def record_fail(username: str) -> None:
    _FAILS[username].append(time.time())


def clear_fails(username: str) -> None:
    _FAILS.pop(username, None)
