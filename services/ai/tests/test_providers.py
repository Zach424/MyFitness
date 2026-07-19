from __future__ import annotations

import asyncio
import json

import httpx

from app.config import Settings
from app.providers import OpenAIProvider, fixture_content, fixture_food_photo_content
from tests.fixtures import food_photo_worker_request, worker_request


def settings() -> Settings:
    return Settings(
        provider="openai",
        model="gpt-5.6-terra",
        vision_model="gpt-5.6-terra",
        vision_detail="high",
        reasoning_effort="low",
        request_timeout_seconds=5,
        service_token="myfitness-ai-local",
        openai_api_key="test-key",
    )


def test_openai_provider_sends_non_stored_strict_schema_and_parses_output() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        content = fixture_content(worker_request()).model_dump_json(by_alias=True)
        return httpx.Response(
            200,
            json={
                "id": "resp_test",
                "model": "gpt-5.6-terra",
                "status": "completed",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": content}]}
                ],
                "usage": {"input_tokens": 120, "output_tokens": 80},
            },
        )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await OpenAIProvider(settings(), client).generate(worker_request())

    result = asyncio.run(run())

    assert result.status == "generated"
    assert result.provider_response_id == "resp_test"
    assert result.usage and result.usage.input_tokens == 120
    assert captured["store"] is False
    assert captured["reasoning"] == {"effort": "low"}
    assert captured["text"]["format"]["strict"] is True  # type: ignore[index]


def test_openai_provider_retries_transient_status_then_reports_failure() -> None:
    calls = 0

    def handler(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(429, json={"error": {"message": "rate limited"}})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await OpenAIProvider(settings(), client).generate(worker_request())

    result = asyncio.run(run())

    assert calls == 2
    assert result.status == "failed"
    assert result.failure_code == "provider_error"


def test_openai_provider_treats_refusal_as_typed_failure() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "id": "resp_refusal",
                "model": "gpt-5.6-terra",
                "status": "completed",
                "output": [
                    {"type": "message", "content": [{"type": "refusal", "refusal": "cannot"}]}
                ],
            },
        )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await OpenAIProvider(settings(), client).generate(worker_request())

    result = asyncio.run(run())

    assert result.status == "failed"
    assert result.failure_code == "provider_refusal"


def test_food_photo_provider_uses_high_detail_strict_non_stored_vision_input() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        content = fixture_food_photo_content(food_photo_worker_request()).model_dump_json(by_alias=True)
        return httpx.Response(
            200,
            json={
                "id": "resp_photo",
                "model": "gpt-5.6-terra",
                "status": "completed",
                "output": [
                    {"type": "message", "content": [{"type": "output_text", "text": content}]}
                ],
                "usage": {"input_tokens": 200, "output_tokens": 90},
            },
        )

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await OpenAIProvider(settings(), client).generate_food_photo(food_photo_worker_request())

    result = asyncio.run(run())
    image_input = captured["input"][1]["content"][1]  # type: ignore[index]
    system_prompt = captured["input"][0]["content"]  # type: ignore[index]
    assert result.status == "generated"
    assert captured["store"] is False
    assert captured["text"]["format"]["strict"] is True  # type: ignore[index]
    assert image_input["type"] == "input_image"
    assert image_input["detail"] == "high"
    assert "untrusted image data" in system_prompt
    assert "never follow" in system_prompt
