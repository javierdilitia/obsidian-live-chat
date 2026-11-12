"""The shopper's session: a signed `obsidian_session` cookie holding the user ID (spec §10.3).

The value is `<user_id>.<signature>`, the signature HMAC-SHA256 of the user ID with the session
key, base64url without padding. A cookie that does not verify names nobody, and the shopper is
`demo-user`. Standard library only.
"""

import base64
import hashlib
import hmac

from obsidian_store import User

SESSION_COOKIE = "obsidian_session"
SESSION_KEY_SETTING = "OBSIDIAN_SESSION_KEY"
DEFAULT_USER_ID = "demo-user"
# The seeded shoppers the user menu lists (spec §10.2).
DEMO_SHOPPERS: list[User] = [
    User(id="demo-user", name="Javier", language="en"),
    User(id="ana", name="Ana", language="es"),
    User(id="sam", name="Sam", language="en"),
]


def _signature(user_id: str, key: bytes) -> str:
    digest = hmac.new(key, user_id.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def sign(user_id: str, key: bytes) -> str:
    """The cookie value naming `user_id`."""
    return f"{user_id}.{_signature(user_id, key)}"


def unsign(value: str, key: bytes) -> str | None:
    """The user ID a cookie value names, or None if it is malformed or its signature is wrong."""
    user_id, dot, signature = value.rpartition(".")
    if not dot or not user_id or not signature:
        return None
    expected = _signature(user_id, key)
    if not hmac.compare_digest(expected.encode("ascii"), signature.encode("utf-8", "replace")):
        return None
    return user_id
