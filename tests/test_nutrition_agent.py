import datetime
from unittest.mock import AsyncMock, patch, MagicMock
import pytest

MOCK_PLAN = {
    "id": "plan-uuid",
    "diet_type": "omnivore",
    "allergies": [],
    "targets": {
        "calories_kcal": 2200, "protein_g": 150, "carbs_g": 220,
        "fat_g": 70, "fiber_g": 30, "sugar_g": 50, "sodium_mg": 2300,
        "cholesterol_mg": 300, "iron_mg": 18, "vitamin_b12_ug": 2.4,
        "vitamin_d_ug": 15, "vitamin_c_mg": 90, "calcium_mg": 1000,
    },
    "foods": {
        "iron": [{"food": "spinaci cotti", "qty": "200g"}],
        "vitamin_b12": [{"food": "uova", "qty": "2"}],
        "vitamin_d": [{"food": "salmone", "qty": "100g"}],
    },
}

MOCK_NUTRIENTS = {
    "calories_kcal": 480, "protein_g": 42, "carbs_g": 55,
    "fat_g": 8, "fiber_g": 3, "sugar_g": 2, "sodium_mg": 320,
    "cholesterol_mg": 85, "iron_mg": 3.2, "vitamin_b12_ug": 1.1,
    "vitamin_d_ug": 0.0, "vitamin_c_mg": 4, "calcium_mg": 28,
}


@pytest.fixture
def mock_nutrition_deps():
    with patch("backend.agents.nutrition.get_nutrition_plan") as mock_plan, \
         patch("backend.agents.nutrition.estimate_nutrients") as mock_est, \
         patch("backend.agents.nutrition.save_nutrition_log") as mock_save, \
         patch("backend.agents.nutrition.get_weekly_nutrition") as mock_weekly:
        mock_plan.return_value = MOCK_PLAN
        mock_est.return_value = MOCK_NUTRIENTS
        mock_save.return_value = None
        mock_weekly.return_value = [
            {"date": "2026-04-05", "nutrients": MOCK_NUTRIENTS},
            {"date": "2026-04-06", "nutrients": MOCK_NUTRIENTS},
        ]
        yield mock_plan, mock_est, mock_save, mock_weekly


async def test_log_meal_returns_context_string(mock_nutrition_deps):
    from backend.agents.nutrition import log_meal
    result = await log_meal("ho mangiato pollo e riso")
    assert "480" in result   # calories
    assert "42" in result    # protein


async def test_log_meal_saves_to_db(mock_nutrition_deps):
    mock_plan, mock_est, mock_save, _ = mock_nutrition_deps
    from backend.agents.nutrition import log_meal
    await log_meal("ho mangiato pollo e riso")
    mock_save.assert_called_once()


async def test_log_meal_detects_deficiency(mock_nutrition_deps):
    from backend.agents.nutrition import log_meal
    result = await log_meal("ho mangiato pollo e riso")
    # iron 3.2 of 18mg = 17.8% → BASSO
    assert "BASSO" in result or "ferro" in result.lower()


async def test_log_meal_suggests_food_for_deficiency(mock_nutrition_deps):
    from backend.agents.nutrition import log_meal
    result = await log_meal("ho mangiato pollo e riso")
    # foods for iron: spinaci cotti
    assert "spinaci" in result.lower()


async def test_log_meal_uses_diet_and_allergies_from_plan(mock_nutrition_deps):
    mock_plan, mock_est, _, _ = mock_nutrition_deps
    from backend.agents.nutrition import log_meal
    await log_meal("ho mangiato lenticchie")
    mock_est.assert_called_once_with("ho mangiato lenticchie", "omnivore", [])


async def test_log_meal_no_plan_uses_defaults(mock_nutrition_deps):
    mock_plan, mock_est, mock_save, _ = mock_nutrition_deps
    mock_plan.return_value = None  # No plan set
    from backend.agents.nutrition import log_meal
    result = await log_meal("ho mangiato pasta")
    assert isinstance(result, str)
    assert len(result) > 0


async def test_log_meal_weekly_summary_on_keyword(mock_nutrition_deps):
    from backend.agents.nutrition import log_meal
    result = await log_meal("com'ho mangiato questa settimana?")
    # Should return weekly summary, not meal log
    assert "settimana" in result.lower() or "media" in result.lower() or "weekly" in result.lower()


async def test_get_weekly_summary_returns_averages(mock_nutrition_deps):
    mock_plan, _, _, mock_weekly = mock_nutrition_deps
    from backend.agents.nutrition import get_weekly_summary
    result = await get_weekly_summary("2026-03-30")
    assert isinstance(result, str)
    assert "480" in result or "media" in result.lower()


async def test_get_weekly_summary_empty_week(mock_nutrition_deps):
    mock_plan, _, _, mock_weekly = mock_nutrition_deps
    mock_weekly.return_value = []
    from backend.agents.nutrition import get_weekly_summary
    result = await get_weekly_summary("2026-03-30")
    assert "nessun" in result.lower() or "0" in result
