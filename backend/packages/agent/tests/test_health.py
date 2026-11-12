from fastapi.testclient import TestClient

from halden_data_fake import FakeCatalogSource
from obsidian_agent.app import create_app
from obsidian_data_contract import Cartridge


def test_health():
    app = create_app(cartridge=Cartridge("test", "Test", FakeCatalogSource))
    r = TestClient(app).get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "cartridge": "test"}
