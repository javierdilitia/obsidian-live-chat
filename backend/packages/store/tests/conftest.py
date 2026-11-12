# Show full assertion diffs from the shared contract suite, which lives outside tests/.
import pytest

pytest.register_assert_rewrite("obsidian_store.contract_tests")
