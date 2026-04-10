from unittest.mock import AsyncMock, MagicMock, patch
import pytest

FRIDGE = [
    {"id": "uuid1", "name": "pollo", "quantity": 500, "unit": "g"},
    {"id": "uuid2", "name": "riso", "quantity": 300, "unit": "g"},
]

PLAN = {
    "diet_type": "omnivore",
    "allergies": [],
    "targets": {"calories_kcal": 2000, "protein_g": 150, "carbs_g": 200, "fat_g": 60},
    "foods": {},
}


@pytest.fixture(autouse=True)
def mock_deps():
    with (
        patch("backend.agents.nutrition.get_fridge_items", new_callable=AsyncMock) as mock_fridge,
        patch("backend.agents.nutrition.upsert_fridge_item", new_callable=AsyncMock) as mock_upsert,
        patch("backend.agents.nutrition.remove_fridge_items", new_callable=AsyncMock) as mock_remove,
        patch("backend.agents.nutrition.extract_fridge_items", new_callable=AsyncMock) as mock_extract,
        patch("backend.agents.nutrition.get_nutrition_plan", new_callable=AsyncMock) as mock_plan,
        patch("backend.agents.nutrition.get_weekly_nutrition", new_callable=AsyncMock) as mock_logs,
    ):
        mock_fridge.return_value = FRIDGE
        mock_plan.return_value = PLAN
        mock_logs.return_value = []
        yield {
            "fridge": mock_fridge,
            "upsert": mock_upsert,
            "remove": mock_remove,
            "extract": mock_extract,
            "plan": mock_plan,
            "logs": mock_logs,
        }


async def test_log_fridge_add(mock_deps):
    mock_deps["extract"].return_value = [
        {"action": "add", "name": "pollo", "quantity": 500, "unit": "g"},
        {"action": "add", "name": "riso", "quantity": 300, "unit": "g"},
    ]

    from backend.agents.nutrition import log_fridge
    result = await log_fridge("ho comprato 500g di pollo e 300g di riso")

    assert "Frigo aggiornato" in result
    assert "pollo" in result
    assert mock_deps["upsert"].call_count == 2


async def test_log_fridge_remove(mock_deps):
    mock_deps["extract"].return_value = [
        {"action": "remove", "name": "latte"},
    ]

    from backend.agents.nutrition import log_fridge
    result = await log_fridge("ho finito il latte")

    assert "Rimossi" in result
    assert "latte" in result
    mock_deps["remove"].assert_called_once_with(["latte"])


async def test_log_fridge_empty_extraction(mock_deps):
    mock_deps["extract"].return_value = []

    from backend.agents.nutrition import log_fridge
    result = await log_fridge("ciao come stai")

    assert result == ""
    mock_deps["upsert"].assert_not_called()


async def test_suggest_meals_with_fridge(mock_deps):
    mock_anthropic_response = MagicMock()
    mock_anthropic_response.content = [MagicMock(text=(
        "SEMPLICE: Pollo e riso\n→ pollo, riso · ~450kcal · 40g prot\n"
        "COMPLESSO: Risotto al pollo\n→ pollo, riso, spezie · ~600kcal · 48g prot"
    ))]

    with patch("anthropic.AsyncAnthropic") as mock_async_anthropic:
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=mock_anthropic_response)
        mock_async_anthropic.return_value = mock_client

        from backend.agents.nutrition import suggest_meals
        result = await suggest_meals()

    assert "SEMPLICE" in result
    assert "COMPLESSO" in result


async def test_suggest_meals_empty_fridge(mock_deps):
    mock_deps["fridge"].return_value = []

    from backend.agents.nutrition import suggest_meals
    result = await suggest_meals()

    assert "Frigo vuoto" in result
