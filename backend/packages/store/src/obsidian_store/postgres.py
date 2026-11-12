"""`PostgresStore`: the store in Postgres 17, through SQLAlchemy 2 (asyncio) and asyncpg.

Every cart rule is one statement, so two requests in two transactions never sell the last item
twice. `save_tab` updates the tab, appends a revision and trims old ones in one transaction.
Proven by `StoreContract` against a real database (`tests/test_postgres.py`).
"""

import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    MetaData,
    RowMapping,
    Table,
    Text,
    and_,
    delete,
    func,
    literal,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB, insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from obsidian_store.migrate import upgrade
from obsidian_store.models import (
    ActionRecord,
    CartChange,
    CartLine,
    ProductFact,
    ProductFacts,
    RunRecord,
    Snapshot,
    TabRecord,
    TabRevision,
    User,
)
from obsidian_store.store import TAB_REVISIONS_KEPT

# Query-side views of the tables the migrations create (the migrations own the schema).
_meta = MetaData()


def _time(name: str) -> Column[datetime]:
    return Column(name, DateTime(timezone=True))


users_table = Table(
    "users", _meta, Column("id", Text), Column("name", Text), Column("language", Text)
)
workspaces = Table(
    "workspaces", _meta, Column("user_id", Text, primary_key=True), Column("active_tab_id", Text)
)
tabs = Table(
    "tabs",
    _meta,
    Column("id", Text),
    Column("user_id", Text),
    Column("surface_id", Text),
    Column("kind", Text),
    Column("status", Text),
    Column("position", Integer),
    Column("card", JSONB),
    Column("snapshot", JSONB(none_as_null=True)),
    Column("product_facts", JSONB),
    Column("language", Text),
    _time("created_at"),
    _time("updated_at"),
    _time("closed_at"),
)
tab_revisions = Table(
    "tab_revisions",
    _meta,
    Column("tab_id", Text),
    Column("rev", Integer),
    Column("card", JSONB),
    Column("snapshot", JSONB),
    Column("product_facts", JSONB),
    Column("run_id", Text),
    _time("created_at"),
)
cart_lines = Table(
    "cart_lines",
    _meta,
    Column("user_id", Text, primary_key=True),
    Column("product_id", Text, primary_key=True),
    Column("qty", Integer),
    _time("added_at"),
    _time("updated_at"),
)
runs = Table(
    "runs",
    _meta,
    *(Column(name, Text) for name in ("id", "user_id", "tab_id", "trigger", "tool", "outcome")),
    *(Column(name, Text) for name in ("router_model", "ui_model", "error")),
    *(
        Column(name, Integer)
        for name in (
            "tokens_in",
            "tokens_out",
            "tokens_cached",
            "latency_ms",
            "first_message_ms",
            "retries",
        )
    ),
    Column("tool_round_used", Boolean),
    _time("started_at"),
    _time("finished_at"),
)
processed_actions = Table(
    "processed_actions",
    _meta,
    Column("request_id", Text, primary_key=True),
    Column("user_id", Text),
    Column("result", JSONB),
    _time("at"),
)

# The wall clock inside a statement: distinct per call, unlike now() (the transaction's start).
_clock = func.clock_timestamp


def _facts_json(facts: ProductFacts) -> dict[str, Any]:
    return {product_id: fact.model_dump() for product_id, fact in facts.items()}


def _facts(value: dict[str, Any]) -> ProductFacts:
    return {product_id: ProductFact.model_validate(fact) for product_id, fact in value.items()}


def _tab(row: RowMapping) -> TabRecord:
    return TabRecord.model_validate({**row, "product_facts": _facts(row["product_facts"])})


class PostgresStore:
    def __init__(self, engine: AsyncEngine) -> None:
        self.engine = engine

    @classmethod
    async def connect(cls, url: str) -> "PostgresStore":
        """Opens the database at `url`, migrates it to the latest schema, returns the store."""
        engine = create_async_engine(url)
        try:
            async with engine.begin() as connection:
                await connection.run_sync(upgrade)
        except BaseException:
            await engine.dispose()
            raise
        return cls(engine)

    async def close(self) -> None:
        await self.engine.dispose()

    # Users

    async def upsert_users(self, users: Sequence[User]) -> None:
        if not users:
            return
        statement = insert(users_table).values([user.model_dump() for user in users])
        statement = statement.on_conflict_do_update(
            index_elements=[users_table.c.id],
            set_={"name": statement.excluded.name, "language": statement.excluded.language},
        )
        async with self.engine.begin() as connection:
            await connection.execute(statement)

    async def list_users(self) -> list[User]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                select(users_table.c.id, users_table.c.name, users_table.c.language).order_by(
                    users_table.c.id
                )
            )
            return [User.model_validate(dict(row)) for row in result.mappings()]

    async def get_user(self, user_id: str) -> User | None:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                select(users_table.c.id, users_table.c.name, users_table.c.language).where(
                    users_table.c.id == user_id
                )
            )
            row = result.mappings().first()
        return User.model_validate(dict(row)) if row else None

    # Workspace and tabs

    async def open_tabs(self, user_id: str) -> list[TabRecord]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                select(tabs)
                .where(tabs.c.user_id == user_id, tabs.c.status == "open")
                .order_by(tabs.c.position)
            )
            return [_tab(row) for row in result.mappings()]

    async def create_tab(
        self, user_id: str, *, surface_id: str, kind: str, card: dict[str, Any], language: str
    ) -> TabRecord:
        try:
            async with self.engine.begin() as connection:
                await self._lock_workspace(connection, user_id)
                last = await connection.scalar(
                    select(func.max(tabs.c.position)).where(
                        tabs.c.user_id == user_id, tabs.c.status == "open"
                    )
                )
                now = await connection.scalar(select(_clock()))
                result = await connection.execute(
                    insert(tabs)
                    .values(
                        id=uuid.uuid4().hex,
                        user_id=user_id,
                        surface_id=surface_id,
                        kind=kind,
                        status="open",
                        position=0 if last is None else last + 1,
                        card=card,
                        snapshot=None,
                        product_facts={},
                        language=language,
                        created_at=now,
                        updated_at=now,
                        closed_at=None,
                    )
                    .returning(*tabs.c)
                )
                tab = _tab(result.mappings().one())
                await connection.execute(
                    update(workspaces)
                    .where(workspaces.c.user_id == user_id)
                    .values(active_tab_id=tab.id)
                )
        except IntegrityError as error:
            raise ValueError(f"surface {surface_id} already has a tab") from error
        return tab

    @staticmethod
    async def _lock_workspace(connection: AsyncConnection, user_id: str) -> None:
        """Makes the user's workspace row if needed and locks it until the transaction ends, so
        one user's tab changes run one at a time."""
        statement = insert(workspaces).values(user_id=user_id)
        statement = statement.on_conflict_do_update(
            index_elements=[workspaces.c.user_id], set_={"user_id": statement.excluded.user_id}
        )
        await connection.execute(statement)

    async def active_tab_id(self, user_id: str) -> str | None:
        async with self.engine.connect() as connection:
            return await connection.scalar(
                select(workspaces.c.active_tab_id).where(workspaces.c.user_id == user_id)
            )

    async def save_tab(
        self,
        tab_id: str,
        *,
        card: dict[str, Any],
        snapshot: Snapshot,
        product_facts: ProductFacts,
        run_id: str,
    ) -> TabRecord:
        facts = _facts_json(product_facts)
        async with self.engine.begin() as connection:
            now = await connection.scalar(select(_clock()))
            # The update locks the tab's row, so two saves of one tab number their revisions
            # one after the other.
            result = await connection.execute(
                update(tabs)
                .where(tabs.c.id == tab_id)
                .values(card=card, snapshot=snapshot, product_facts=facts, updated_at=now)
                .returning(*tabs.c)
            )
            row = result.mappings().first()
            if row is None:
                raise KeyError(tab_id)
            last = await connection.scalar(
                select(func.max(tab_revisions.c.rev)).where(tab_revisions.c.tab_id == tab_id)
            )
            rev = (last or 0) + 1
            await connection.execute(
                insert(tab_revisions).values(
                    tab_id=tab_id,
                    rev=rev,
                    card=card,
                    snapshot=snapshot,
                    product_facts=facts,
                    run_id=run_id,
                    created_at=now,
                )
            )
            await connection.execute(
                delete(tab_revisions).where(
                    tab_revisions.c.tab_id == tab_id,
                    tab_revisions.c.rev <= rev - TAB_REVISIONS_KEPT,
                )
            )
        return _tab(row)

    async def tab_revisions(self, tab_id: str) -> list[TabRevision]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                select(tab_revisions)
                .where(tab_revisions.c.tab_id == tab_id)
                .order_by(tab_revisions.c.rev)
            )
            return [
                TabRevision.model_validate({**row, "product_facts": _facts(row["product_facts"])})
                for row in result.mappings()
            ]

    # Cart

    async def cart(self, user_id: str) -> list[CartLine]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                select(cart_lines.c.product_id, cart_lines.c.qty, cart_lines.c.added_at)
                .where(cart_lines.c.user_id == user_id)
                .order_by(cart_lines.c.added_at, cart_lines.c.product_id)
            )
            return [CartLine.model_validate(dict(row)) for row in result.mappings()]

    async def add_to_cart(self, user_id: str, product_id: str, *, stock: int) -> CartChange:
        # A new line when one fits; else one more on the existing line, if that one fits too.
        return await self._put(
            user_id,
            product_id,
            new_qty=1,
            stock=stock,
            on_line=cart_lines.c.qty + 1,
            allowed=cart_lines.c.qty + 1 <= stock,
        )

    async def set_cart_qty(
        self, user_id: str, product_id: str, qty: int, *, stock: int
    ) -> CartChange:
        if qty == 0:
            await self.remove_from_cart(user_id, product_id)
            return CartChange(ok=True, qty=0)
        return await self._put(
            user_id,
            product_id,
            new_qty=qty,
            stock=stock,
            on_line=literal(qty),
            allowed=or_(literal(qty) <= stock, literal(qty) <= cart_lines.c.qty),
        )

    async def _put(
        self,
        user_id: str,
        product_id: str,
        *,
        new_qty: int,
        stock: int,
        on_line: Any,
        allowed: Any,
    ) -> CartChange:
        """Writes the line only when the rule holds. Each write is one conditional statement, so
        the rule is checked against the row as it is at that moment, never a stale read: first
        `UPDATE … WHERE rule RETURNING` for an existing line, then, for a new one,
        `INSERT … WHERE new_qty <= stock ON CONFLICT DO UPDATE … WHERE rule RETURNING` (a line
        another request added in between takes the conflict path). No row back means refused."""
        line = and_(cart_lines.c.user_id == user_id, cart_lines.c.product_id == product_id)
        async with self.engine.begin() as connection:
            qty = await connection.scalar(
                update(cart_lines)
                .where(line, allowed)
                .values(qty=on_line, updated_at=_clock())
                .returning(cart_lines.c.qty)
            )
            if qty is None:
                source = select(
                    literal(user_id), literal(product_id), literal(new_qty), _clock(), _clock()
                ).where(literal(new_qty) <= stock)
                statement = insert(cart_lines).from_select(
                    ["user_id", "product_id", "qty", "added_at", "updated_at"], source
                )
                qty = await connection.scalar(
                    statement.on_conflict_do_update(
                        index_elements=[cart_lines.c.user_id, cart_lines.c.product_id],
                        set_={"qty": on_line, "updated_at": _clock()},
                        where=allowed,
                    ).returning(cart_lines.c.qty)
                )
            if qty is not None:
                return CartChange(ok=True, qty=qty)
            current = await connection.scalar(select(cart_lines.c.qty).where(line))
        return CartChange(ok=False, qty=current or 0)

    async def remove_from_cart(self, user_id: str, product_id: str) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(
                delete(cart_lines).where(
                    cart_lines.c.user_id == user_id, cart_lines.c.product_id == product_id
                )
            )

    # Runs

    async def record_run(self, run: RunRecord) -> None:
        async with self.engine.begin() as connection:
            await connection.execute(insert(runs).values(run.model_dump()))

    async def runs(self, user_id: str) -> list[RunRecord]:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                select(runs).where(runs.c.user_id == user_id).order_by(runs.c.started_at)
            )
            return [RunRecord.model_validate(dict(row)) for row in result.mappings()]

    # Idempotency

    async def action_result(self, request_id: str, *, since: datetime) -> ActionRecord | None:
        async with self.engine.connect() as connection:
            result = await connection.execute(
                select(processed_actions).where(
                    processed_actions.c.request_id == request_id, processed_actions.c.at >= since
                )
            )
            row = result.mappings().first()
        return ActionRecord.model_validate(dict(row)) if row else None

    async def save_action_result(self, record: ActionRecord) -> None:
        statement = insert(processed_actions).values(record.model_dump())
        statement = statement.on_conflict_do_update(
            index_elements=[processed_actions.c.request_id],
            set_={
                "user_id": statement.excluded.user_id,
                "result": statement.excluded.result,
                "at": statement.excluded.at,
            },
        )
        async with self.engine.begin() as connection:
            await connection.execute(statement)

    async def purge_action_results(self, before: datetime) -> int:
        async with self.engine.begin() as connection:
            result = await connection.execute(
                delete(processed_actions).where(processed_actions.c.at < before)
            )
        return result.rowcount
