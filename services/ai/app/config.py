from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Settings:
    provider: Literal["fixture", "openai"]
    model: str
    vision_model: str
    vision_detail: Literal["low", "high"]
    reasoning_effort: Literal["none", "low", "medium"]
    request_timeout_seconds: float
    service_token: str
    openai_api_key: str | None


def load_settings() -> Settings:
    provider = os.getenv("AI_PROVIDER", "fixture")
    if provider not in {"fixture", "openai"}:
        raise RuntimeError("AI_PROVIDER must be fixture or openai")

    reasoning_effort = os.getenv("AI_REASONING_EFFORT", "low")
    if reasoning_effort not in {"none", "low", "medium"}:
        raise RuntimeError("AI_REASONING_EFFORT must be none, low or medium")

    vision_detail = os.getenv("AI_VISION_DETAIL", "high")
    if vision_detail not in {"low", "high"}:
        raise RuntimeError("AI_VISION_DETAIL must be low or high")

    timeout = float(os.getenv("AI_REQUEST_TIMEOUT_SECONDS", "20"))
    if timeout < 1 or timeout > 60:
        raise RuntimeError("AI_REQUEST_TIMEOUT_SECONDS must be between 1 and 60")

    api_key = os.getenv("OPENAI_API_KEY")
    if provider == "openai" and not api_key:
        raise RuntimeError("OPENAI_API_KEY is required when AI_PROVIDER=openai")

    service_token = os.getenv("AI_SERVICE_TOKEN", "myfitness-ai-local")
    if len(service_token) < 12:
        raise RuntimeError("AI_SERVICE_TOKEN must contain at least 12 characters")

    return Settings(
        provider=provider,  # type: ignore[arg-type]
        model=os.getenv("AI_MODEL", "gpt-5.6-terra"),
        vision_model=os.getenv("AI_VISION_MODEL", "gpt-5.6-terra"),
        vision_detail=vision_detail,  # type: ignore[arg-type]
        reasoning_effort=reasoning_effort,  # type: ignore[arg-type]
        request_timeout_seconds=timeout,
        service_token=service_token,
        openai_api_key=api_key,
    )
