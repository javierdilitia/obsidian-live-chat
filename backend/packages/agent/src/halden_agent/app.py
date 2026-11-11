"""FastAPI application factory.

Dev run: `uv run --directory backend uvicorn halden_agent.app:create_app --factory --reload`
"""

from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Halden agent", version="0.1.0")

    @app.get("/health")
    async def health() -> dict[str, str]:  # pyright: ignore[reportUnusedFunction]
        return {"status": "ok"}

    return app
