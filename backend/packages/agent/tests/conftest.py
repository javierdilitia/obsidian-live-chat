"""Live tests call the real Azure deployment, so they only run when HALDEN_LIVE=1."""

import os

import pytest


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("HALDEN_LIVE") == "1":
        return
    skip = pytest.mark.skip(reason="live Azure test: set HALDEN_LIVE=1 to run")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)
