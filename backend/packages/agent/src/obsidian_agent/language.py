"""The shopper's languages: the codes Obsidian speaks and the names the page prompt uses."""

import logging
from typing import TypeGuard

log = logging.getLogger(__name__)

LANGUAGES: dict[str, str] = {"en": "English", "es": "Spanish"}
DEFAULT_LANGUAGE = "en"


def is_language(value: object) -> TypeGuard[str]:
    """True for a language code Obsidian speaks."""
    return isinstance(value, str) and value in LANGUAGES


def normalise_language(value: object) -> str:
    """`value` when Obsidian speaks it, else English (logged): a stored language from a writer that
    skipped the check must not fail a run."""
    if is_language(value):
        return value
    log.warning("unknown language %r: using %s", value, DEFAULT_LANGUAGE)
    return DEFAULT_LANGUAGE
