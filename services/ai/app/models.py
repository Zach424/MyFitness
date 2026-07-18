from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


def to_camel(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


EvidenceKey = Literal[
    "plan_schedule",
    "plan_experience",
    "plan_recovery",
    "recent_activity",
    "recent_workouts",
    "recent_meals",
    "nutrition_focus",
]

FailureCode = Literal[
    "provider_unavailable",
    "provider_timeout",
    "provider_refusal",
    "provider_error",
    "invalid_output",
    "safety_validation_failed",
]


class ExplanationHighlight(ContractModel):
    title: str = Field(min_length=1, max_length=60)
    detail: str = Field(min_length=1, max_length=220)
    evidence_keys: list[EvidenceKey] = Field(min_length=1, max_length=3)


class ExplanationContent(ContractModel):
    headline: str = Field(min_length=1, max_length=60)
    overview: str = Field(min_length=1, max_length=240)
    highlights: list[ExplanationHighlight] = Field(min_length=2, max_length=4)
    next_step: str = Field(min_length=1, max_length=160)


class PlanSession(ContractModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    title: str = Field(min_length=1, max_length=80)
    kind: Literal["strength", "cardio", "recovery"]
    planned_minutes: int = Field(ge=10, le=90)
    intensity: Literal["easy", "moderate"]
    activities: list[str] = Field(min_length=1, max_length=8)


class NutritionFocus(ContractModel):
    title: str = Field(min_length=1, max_length=60)
    action: str = Field(min_length=1, max_length=180)


class PlanReason(ContractModel):
    code: str = Field(min_length=2, max_length=80)
    label: str = Field(min_length=1, max_length=60)
    detail: str = Field(min_length=1, max_length=240)


class PlanEvidence(ContractModel):
    onboarding_revision: int = Field(gt=0)
    dashboard_generated_at: str
    readiness_score: int | None = Field(default=None, ge=0, le=100)
    recent_active_days: int = Field(ge=0)
    recent_workout_count: int = Field(ge=0)
    recent_active_minutes: float = Field(ge=0)
    recent_meal_count: int = Field(ge=0)


class PlanContext(ContractModel):
    plan_id: str
    plan_revision: int = Field(gt=0)
    week_start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    status: Literal["draft", "accepted", "modified", "skipped"]
    sessions: list[PlanSession] = Field(max_length=4)
    nutrition_focuses: list[NutritionFocus] = Field(min_length=3, max_length=4)
    reasons: list[PlanReason] = Field(min_length=1, max_length=8)
    evidence: PlanEvidence
    evidence_keys: list[EvidenceKey] = Field(min_length=1, max_length=7)


class WorkerRequest(ContractModel):
    request_id: str
    prompt_version: Literal["plan-explanation-v1"]
    validator_version: Literal["plan-explanation-safety-v1"]
    context: PlanContext


class WorkerUsage(ContractModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)


class WorkerResponse(ContractModel):
    status: Literal["generated", "failed"]
    provider: Literal["fixture", "openai"]
    model: str = Field(min_length=1, max_length=120)
    content: ExplanationContent | None
    failure_code: FailureCode | None
    provider_response_id: str | None = Field(default=None, max_length=200)
    usage: WorkerUsage | None
    latency_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def state_matches_payload(self) -> "WorkerResponse":
        if self.status == "generated" and (self.content is None or self.failure_code is not None):
            raise ValueError("generated responses require content only")
        if self.status == "failed" and (self.content is not None or self.failure_code is None):
            raise ValueError("failed responses require a failure code only")
        return self


class AllowedFood(ContractModel):
    catalog_key: str = Field(pattern=r"^[a-z0-9_:-]{2,100}$")
    label: str = Field(min_length=1, max_length=100)
    category: Literal["staple", "protein", "vegetable", "fruit", "dairy", "snack", "custom"]


class FoodPhotoPortionRange(ContractModel):
    min_grams: int = Field(ge=5, le=2000)
    max_grams: int = Field(ge=5, le=2000)

    @model_validator(mode="after")
    def ordered_range(self) -> "FoodPhotoPortionRange":
        if self.max_grams < self.min_grams:
            raise ValueError("maxGrams must be greater than or equal to minGrams")
        return self


class FoodPhotoCandidate(ContractModel):
    catalog_key: str = Field(pattern=r"^[a-z0-9_:-]{2,100}$")
    label: str = Field(min_length=1, max_length=100)
    confidence: Literal["low", "medium", "high"]
    portion_range: FoodPhotoPortionRange
    visual_basis: str = Field(min_length=1, max_length=180)


class FoodPhotoContent(ContractModel):
    summary: str = Field(min_length=1, max_length=180)
    safety_status: Literal["safe", "rejected"]
    needs_manual_entry: bool
    candidates: list[FoodPhotoCandidate] = Field(max_length=5)


class FoodPhotoWorkerRequest(ContractModel):
    request_id: str
    prompt_version: Literal["food-photo-candidates-v1"]
    validator_version: Literal["food-photo-catalog-safety-v1"]
    image_data_url: str = Field(pattern=r"^data:image/jpeg;base64,", max_length=12_000_000)
    allowed_foods: list[AllowedFood] = Field(min_length=1, max_length=100)


class FoodPhotoWorkerResponse(ContractModel):
    status: Literal["generated", "failed"]
    provider: Literal["fixture", "openai"]
    model: str = Field(min_length=1, max_length=120)
    content: FoodPhotoContent | None
    failure_code: FailureCode | None
    provider_response_id: str | None = Field(default=None, max_length=200)
    usage: WorkerUsage | None
    latency_ms: int = Field(ge=0)

    @model_validator(mode="after")
    def state_matches_payload(self) -> "FoodPhotoWorkerResponse":
        if self.status == "generated" and (self.content is None or self.failure_code is not None):
            raise ValueError("generated responses require content only")
        if self.status == "failed" and (self.content is not None or self.failure_code is None):
            raise ValueError("failed responses require a failure code only")
        return self
