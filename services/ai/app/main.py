from __future__ import annotations

import hmac

from fastapi import Depends, FastAPI, Header, HTTPException

from .config import Settings, load_settings
from .models import WorkerRequest, WorkerResponse
from .providers import build_provider


app = FastAPI(
    title="MyFitness AI worker",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
)


def settings() -> Settings:
    return load_settings()


def authorize(
    authorization: str | None = Header(default=None),
    current: Settings = Depends(settings),
) -> None:
    expected = f"Bearer {current.service_token}"
    if authorization is None or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="invalid service authorization")


@app.get("/health")
async def health(current: Settings = Depends(settings)) -> dict[str, str]:
    return {"status": "ok", "service": "myfitness-ai", "provider": current.provider}


@app.post("/v1/explanations", response_model=WorkerResponse, dependencies=[Depends(authorize)])
async def explain(request: WorkerRequest, current: Settings = Depends(settings)) -> WorkerResponse:
    return await build_provider(current).generate(request)
