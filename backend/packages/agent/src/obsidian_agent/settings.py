"""Model settings, read from the repo's `.env` (real environment variables win)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

ENDPOINT = "AZURE_FOUNDRY_ENDPOINT"
API_KEY = "AZURE_FOUNDRY_API_KEY"
UI_DEPLOYMENT = "MODEL_UI_DEPLOYMENT"
API_VERSION = "AZURE_OPENAI_API_VERSION"
UI_REASONING_EFFORT = "MODEL_UI_REASONING_EFFORT"
DEFAULT_API_VERSION = "2025-04-01-preview"


class MissingSettings(Exception):
    """One or more required settings are absent or empty. `names` lists every one."""

    def __init__(self, names: list[str]) -> None:
        super().__init__(f"Missing settings: {', '.join(names)}")
        self.names = names


@dataclass(frozen=True)
class Settings:
    endpoint: str
    api_key: str = field(repr=False)
    api_version: str
    ui_deployment: str
    ui_reasoning_effort: str | None = None

    @classmethod
    def from_env(cls, env_file: Path) -> "Settings":
        """Read the env file, let non-empty real environment variables override it."""
        values = dotenv_values(env_file)

        def get(name: str) -> str | None:
            return os.environ.get(name) or values.get(name) or None

        endpoint, api_key = get(ENDPOINT), get(API_KEY)
        deployment = get(UI_DEPLOYMENT)
        api_version = get(API_VERSION) or DEFAULT_API_VERSION
        if not (endpoint and api_key and deployment):
            required = [
                (ENDPOINT, endpoint),
                (API_KEY, api_key),
                (UI_DEPLOYMENT, deployment),
            ]
            raise MissingSettings([name for name, value in required if not value])
        return cls(endpoint, api_key, api_version, deployment, get(UI_REASONING_EFFORT))


def env_setting(name: str, env_file: Path) -> str | None:
    """A setting from the environment, else from the env file; blank means unset."""
    value = os.environ.get(name) or dotenv_values(env_file).get(name)
    return (value or "").strip() or None
