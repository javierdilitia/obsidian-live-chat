import pytest

from halden_data_contract import CatalogSource
from halden_data_contract.contract_tests import CatalogSourceContract
from halden_data_fake import FakeCatalogSource


class TestFakeCatalogSource(CatalogSourceContract):
    @pytest.fixture
    def source(self) -> CatalogSource:
        return FakeCatalogSource()

    @pytest.fixture
    def known_product_id(self) -> str:
        return "aeris-studio-16"

    @pytest.fixture
    def known_order_id(self) -> str:
        return "OB-89027"

    @pytest.fixture
    def known_user_id(self) -> str:
        return "demo-user"
