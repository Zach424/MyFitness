from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from tests.fixtures import worker_request


client = TestClient(app)


def test_fixture_endpoint_requires_service_auth_and_returns_structured_copy() -> None:
    payload = worker_request().model_dump(by_alias=True)
    assert client.post("/v1/explanations", json=payload).status_code == 401

    response = client.post(
        "/v1/explanations",
        json=payload,
        headers={"Authorization": "Bearer myfitness-ai-local"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "generated"
    assert body["provider"] == "fixture"
    assert len(body["content"]["highlights"]) == 3
    assert body["failureCode"] is None


def test_health_exposes_no_key_or_request_content() -> None:
    response = client.get("/health")
    assert response.json() == {
        "status": "ok",
        "service": "myfitness-ai",
        "provider": "fixture",
    }
