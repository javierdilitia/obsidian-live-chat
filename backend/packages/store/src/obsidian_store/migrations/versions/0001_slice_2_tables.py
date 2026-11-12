"""Slice 2's tables: users, workspaces, tabs, tab revisions, cart lines, runs, processed actions.

Revision ID: 0001
Revises:
Create Date: 2026-11-12
"""

from collections.abc import Sequence
from datetime import datetime

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _time(name: str, *, nullable: bool = False) -> "sa.Column[datetime]":
    return sa.Column(name, sa.DateTime(timezone=True), nullable=nullable)


def _now(name: str) -> "sa.Column[datetime]":
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def _user_id() -> "sa.Column[str]":
    return sa.Column(
        "user_id", sa.Text, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("language", sa.Text, nullable=False),
        _now("created_at"),
    )
    op.create_table(
        "tabs",
        sa.Column("id", sa.Text, primary_key=True),
        _user_id(),
        sa.Column("surface_id", sa.Text, nullable=False, unique=True),
        sa.Column("kind", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("card", JSONB, nullable=False),
        sa.Column("snapshot", JSONB, nullable=True),
        sa.Column("product_facts", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("language", sa.Text, nullable=False),
        _time("created_at"),
        _time("updated_at"),
        _time("closed_at", nullable=True),
        sa.CheckConstraint("status IN ('open', 'history')", name="tabs_status"),
    )
    op.create_index("tabs_user_status_position", "tabs", ["user_id", "status", "position"])
    op.create_table(
        "workspaces",
        sa.Column(
            "user_id", sa.Text, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column(
            "active_tab_id", sa.Text, sa.ForeignKey("tabs.id", ondelete="SET NULL"), nullable=True
        ),
    )
    op.create_table(
        "tab_revisions",
        sa.Column(
            "tab_id", sa.Text, sa.ForeignKey("tabs.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("rev", sa.Integer, primary_key=True),
        sa.Column("card", JSONB, nullable=False),
        sa.Column("snapshot", JSONB, nullable=False),
        sa.Column("product_facts", JSONB, nullable=False),
        sa.Column("run_id", sa.Text, nullable=False),
        _time("created_at"),
    )
    op.create_table(
        "cart_lines",
        sa.Column(
            "user_id", sa.Text, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("product_id", sa.Text, primary_key=True),
        sa.Column("qty", sa.Integer, nullable=False),
        _time("added_at"),
        _time("updated_at"),
        sa.CheckConstraint("qty > 0", name="cart_lines_qty_positive"),
    )
    op.create_table(
        "runs",
        sa.Column("id", sa.Text, primary_key=True),
        _user_id(),
        # No foreign key: a run's telemetry outlives its tab.
        sa.Column("tab_id", sa.Text, nullable=True),
        sa.Column("trigger", sa.Text, nullable=False),
        sa.Column("tool", sa.Text, nullable=True),
        sa.Column("outcome", sa.Text, nullable=False),
        sa.Column("router_model", sa.Text, nullable=True),
        sa.Column("ui_model", sa.Text, nullable=True),
        sa.Column("tokens_in", sa.Integer, nullable=False),
        sa.Column("tokens_out", sa.Integer, nullable=False),
        sa.Column("tokens_cached", sa.Integer, nullable=False),
        sa.Column("latency_ms", sa.Integer, nullable=False),
        sa.Column("first_message_ms", sa.Integer, nullable=True),
        sa.Column("retries", sa.Integer, nullable=False),
        sa.Column("tool_round_used", sa.Boolean, nullable=False),
        sa.Column("error", sa.Text, nullable=True),
        _time("started_at"),
        _time("finished_at"),
        sa.CheckConstraint("trigger IN ('command', 'action', 'foryou')", name="runs_trigger"),
    )
    op.create_index("runs_user_started", "runs", ["user_id", "started_at"])
    op.create_table(
        "processed_actions",
        sa.Column("request_id", sa.Text, primary_key=True),
        _user_id(),
        sa.Column("result", JSONB, nullable=False),
        _time("at"),
    )
    op.create_index("processed_actions_at", "processed_actions", ["at"])


def downgrade() -> None:
    for table in (
        "processed_actions",
        "runs",
        "cart_lines",
        "tab_revisions",
        "workspaces",
        "tabs",
        "users",
    ):
        op.drop_table(table)
