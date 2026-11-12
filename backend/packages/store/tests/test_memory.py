import pytest

from obsidian_store import MemoryStore, Store
from obsidian_store.contract_tests import StoreContract


class TestMemoryStore(StoreContract):
    @pytest.fixture
    def store(self) -> Store:
        return MemoryStore()
