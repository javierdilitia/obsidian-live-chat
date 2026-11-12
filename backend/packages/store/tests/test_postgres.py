"""`StoreContract` against a real Postgres. Skipped unless `OBSIDIAN_TEST_DATABASE_URL` is set,
e.g. `postgresql+asyncpg://obsidian:obsidian@localhost:5432/obsidian` with
`docker compose up -d --wait postgres`. The tables are emptied before every test."""

import os
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import text

from obsidian_store.contract_tests import StoreContract
from obsidian_store.postgres import PostgresStore

URL = os.environ.get("OBSIDIAN_TEST_DATABASE_URL", "")
TABLES = "users, workspaces, tabs, tab_revisions, cart_lines, runs, processed_actions"

pytestmark = pytest.mark.skipif(not URL, reason="OBSIDIAN_TEST_DATABASE_URL is not set")


async def _empty(store: PostgresStore) -> None:
    async with store.engine.begin() as connection:
        await connection.execute(text(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE"))


class TestPostgresStore(StoreContract):
    @pytest.fixture
    async def store(self) -> AsyncIterator[PostgresStore]:
        store = await PostgresStore.connect(URL)
        await _empty(store)
        try:
            yield store
        finally:
            await store.close()


async def test_migrations_are_idempotent() -> None:
    first = await PostgresStore.connect(URL)
    await first.close()
    second = await PostgresStore.connect(URL)
    await second.close()
