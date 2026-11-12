import pytest

# test_models.py imports the contract suite; register it first so its asserts get diffs.
pytest.register_assert_rewrite("obsidian_data_contract.contract_tests")
