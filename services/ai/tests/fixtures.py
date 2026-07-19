from __future__ import annotations

from app.models import FoodPhotoWorkerRequest, WorkerRequest


def worker_request() -> WorkerRequest:
    return WorkerRequest.model_validate(
        {
            "requestId": "11111111-1111-4111-8111-111111111111",
            "promptVersion": "plan-explanation-v1",
            "validatorVersion": "plan-explanation-safety-v2",
            "context": {
                "planId": "22222222-2222-4222-8222-222222222222",
                "planRevision": 1,
                "weekStart": "2026-07-20",
                "status": "draft",
                "sessions": [
                    {
                        "date": "2026-07-21",
                        "title": "全身力量 A",
                        "kind": "strength",
                        "plannedMinutes": 35,
                        "intensity": "easy",
                        "activities": ["椅子深蹲"],
                    }
                ],
                "nutritionFocuses": [
                    {"title": "规律进餐", "action": "先固定一餐。"},
                    {"title": "食物多样", "action": "轮换主食和蔬果。"},
                    {"title": "饮水", "action": "在日常节点饮水。"},
                ],
                "reasons": [
                    {"code": "schedule_respected", "label": "按时间排布", "detail": "只使用可用日。"}
                ],
                "evidence": {
                    "onboardingRevision": 1,
                    "dashboardGeneratedAt": "2026-07-19T00:00:00.000Z",
                    "readinessScore": None,
                    "recentActiveDays": 0,
                    "recentWorkoutCount": 0,
                    "recentActiveMinutes": 0,
                    "recentMealCount": 0,
                },
                "evidenceKeys": [
                    "plan_schedule",
                    "plan_experience",
                    "plan_recovery",
                    "recent_activity",
                    "recent_workouts",
                    "recent_meals",
                    "nutrition_focus",
                ],
            },
        }
    )


def food_photo_worker_request() -> FoodPhotoWorkerRequest:
    return FoodPhotoWorkerRequest.model_validate(
        {
            "requestId": "33333333-3333-4333-8333-333333333333",
            "promptVersion": "food-photo-candidates-v2",
            "validatorVersion": "food-photo-catalog-safety-v2",
            "imageDataUrl": "data:image/jpeg;base64,/9j/2Q==",
            "allowedFoods": [
                {"catalogKey": "rice_cooked", "label": "熟米饭", "category": "staple"},
                {
                    "catalogKey": "chicken_breast_cooked",
                    "label": "熟鸡胸肉",
                    "category": "protein",
                },
            ],
        }
    )
