"""The shopper's languages: the codes Obsidian speaks and the names the page prompt uses."""

from typing import TypeGuard

LANGUAGES: dict[str, str] = {"en": "English", "es": "Spanish"}


def is_language(value: object) -> TypeGuard[str]:
    """True for a language code Obsidian speaks."""
    return isinstance(value, str) and value in LANGUAGES
