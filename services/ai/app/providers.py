from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from time import perf_counter

import httpx
from pydantic import ValidationError

from .config import Settings
from .models import ExplanationContent, FailureCode, WorkerRequest, WorkerResponse, WorkerUsage


SYSTEM_PROMPT = """Role: explain an already-generated general fitness plan in simplified Chinese.

Goal: help an adult understand why the existing week is conservative and what to review next.

Success criteria:
- use only the supplied plan context
- keep every highlight grounded with supplied evidenceKeys
- explain; never add, remove, or alter plan activities
- return exactly the required JSON schema

Constraints:
- do not diagnose, treat, prescribe, guarantee outcomes, or infer disease
- do not create calorie, macro, body-weight, supplement, or rapid-loss targets
- do not invent numbers or facts
- do not shame, pressure, or call missing data normal

Output: calm, concrete simplified Chinese. Keep the overview and next step short.

Stop rule: if the evidence cannot support a claim, omit it rather than guessing."""


@dataclass(frozen=True)
class ProviderFailure(Exception):
    code: FailureCode


def fixture_content(request: WorkerRequest) -> ExplanationContent:
    recovery = request.context.evidence.readiness_score
    recovery_detail = (
        "恢复依据暂时不足，原计划因此保持轻松，并为临时变化留出空间。"
        if recovery is None
        else "原计划已参考最近的恢复摘要，但只把它当作保守调整依据。"
    )
    return ExplanationContent.model_validate(
        {
            "headline": "这周先把节奏做稳",
            "overview": "解释只整理现有计划已经使用的依据，不增加训练，也不替你做决定。",
            "highlights": [
                {
                    "title": "安排服从真实时间",
                    "detail": "结构化活动只落在已确认的可用日，空白日可以继续留给恢复和变化。",
                    "evidenceKeys": ["plan_schedule", "plan_experience"],
                },
                {
                    "title": "恢复信息保持保守",
                    "detail": recovery_detail,
                    "evidenceKeys": ["plan_recovery", "recent_activity"],
                },
                {
                    "title": "饮食从可执行处开始",
                    "detail": "关注规律、多样性、饮水和符合个人偏好的选择，内容保持定性。",
                    "evidenceKeys": ["nutrition_focus", "recent_meals"],
                },
            ],
            "nextStep": "检查计划是否符合这一周的真实安排，需要时先替换动作，再决定是否采用。",
        }
    )


class FixtureProvider:
    async def generate(self, request: WorkerRequest) -> WorkerResponse:
        started = perf_counter()
        return WorkerResponse(
            status="generated",
            provider="fixture",
            model="fixture-plan-explainer-v1",
            content=fixture_content(request),
            failure_code=None,
            provider_response_id=None,
            usage=None,
            latency_ms=max(0, round((perf_counter() - started) * 1000)),
        )


class OpenAIProvider:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None):
        self.settings = settings
        self.client = client

    def _payload(self, request: WorkerRequest) -> dict[str, object]:
        schema = ExplanationContent.model_json_schema(by_alias=True)
        return {
            "model": self.settings.model,
            "store": False,
            "reasoning": {"effort": self.settings.reasoning_effort},
            "max_output_tokens": 900,
            "input": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        request.context.model_dump(by_alias=True),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                },
            ],
            "text": {
                "verbosity": "low",
                "format": {
                    "type": "json_schema",
                    "name": "plan_explanation",
                    "description": "A review-only explanation of an existing weekly fitness plan.",
                    "strict": True,
                    "schema": schema,
                },
            },
        }

    @staticmethod
    def _parse_response(payload: dict[str, object]) -> ExplanationContent:
        if payload.get("status") not in {None, "completed"}:
            raise ProviderFailure("provider_error")
        for output in payload.get("output", []):
            if not isinstance(output, dict):
                continue
            for content in output.get("content", []):
                if not isinstance(content, dict):
                    continue
                if content.get("type") == "refusal":
                    raise ProviderFailure("provider_refusal")
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    try:
                        return ExplanationContent.model_validate_json(content["text"])
                    except (ValidationError, ValueError, json.JSONDecodeError) as error:
                        raise ProviderFailure("invalid_output") from error
        raise ProviderFailure("invalid_output")

    async def generate(self, request: WorkerRequest) -> WorkerResponse:
        started = perf_counter()
        failure: FailureCode | None = None
        response_id: str | None = None
        usage: WorkerUsage | None = None
        client = self.client or httpx.AsyncClient(
            timeout=self.settings.request_timeout_seconds,
            headers={
                "Authorization": f"Bearer {self.settings.openai_api_key}",
                "Content-Type": "application/json",
            },
        )
        owns_client = self.client is None
        try:
            for attempt in range(2):
                try:
                    response = await client.post(
                        "https://api.openai.com/v1/responses",
                        json=self._payload(request),
                    )
                except httpx.TimeoutException:
                    failure = "provider_timeout"
                    break
                except httpx.HTTPError:
                    failure = "provider_unavailable"
                    break

                if response.status_code in {429, 500, 502, 503, 504} and attempt == 0:
                    await asyncio.sleep(0.15)
                    continue
                if response.status_code >= 400:
                    failure = "provider_error"
                    break

                body = response.json()
                response_id = body.get("id") if isinstance(body.get("id"), str) else None
                raw_usage = body.get("usage")
                if isinstance(raw_usage, dict):
                    usage = WorkerUsage(
                        input_tokens=int(raw_usage.get("input_tokens", 0)),
                        output_tokens=int(raw_usage.get("output_tokens", 0)),
                    )
                try:
                    content = self._parse_response(body)
                except ProviderFailure as error:
                    failure = error.code
                    break
                return WorkerResponse(
                    status="generated",
                    provider="openai",
                    model=str(body.get("model") or self.settings.model),
                    content=content,
                    failure_code=None,
                    provider_response_id=response_id,
                    usage=usage,
                    latency_ms=max(0, round((perf_counter() - started) * 1000)),
                )
            return WorkerResponse(
                status="failed",
                provider="openai",
                model=self.settings.model,
                content=None,
                failure_code=failure or "provider_error",
                provider_response_id=response_id,
                usage=usage,
                latency_ms=max(0, round((perf_counter() - started) * 1000)),
            )
        finally:
            if owns_client:
                await client.aclose()


def build_provider(settings: Settings) -> FixtureProvider | OpenAIProvider:
    return FixtureProvider() if settings.provider == "fixture" else OpenAIProvider(settings)
