"""Runs the store's Alembic migrations in code: no `alembic.ini`, the scripts ship in the wheel."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, text

MIGRATIONS = Path(__file__).parent / "migrations"
# Any fixed number: two agents starting at once take turns migrating.
_MIGRATION_LOCK = 4_120_771


def upgrade(connection: Connection) -> None:
    """`alembic upgrade head` on `connection` (call through `AsyncConnection.run_sync`)."""
    connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _MIGRATION_LOCK})
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS))
    config.attributes["connection"] = connection
    command.upgrade(config, "head")
