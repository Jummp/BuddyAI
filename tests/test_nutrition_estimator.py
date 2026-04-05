from unittest.mock import AsyncMock, patch, MagicMock
import pytest

MOCK_NUTRIENTS = {
    "calories_kcal": 480,
    "protein_g": 42,
    "carbs_g": 55,
    "fat_g": 8,
    "fiber_g": 3,
    "sugar_g": 2,
    "sodium_mg": 320,
    "cholesterol_mg": 85,
    "iron_mg": 3.2,
    "vitamin_b12_ug": 1.1,
    "vitamin_d_ug": 0.0,
    "vitamin_c_mg": 4,
    "calcium_mg": 28,
}

MOCK_JSON = '{"calories_kcal": 480, "protein_g": 42, "carbs_g": 55, "fat_g": 8, "fiber_g": 3, "sugar_g": 2, "sodium_mg": 320, "cholesterol_mg": 85, "iron_mg": 3.2, "vitamin_b12_ug": 1.1, "vitamin_d_ug": 0.0, "vitamin_c_mg": 4, "calcium_mg": 28}'


@pytest.fixture
def mock_anthropic_client():
    with patch("backend.services.nutrition_estimator.client") as mock:
        yield mock


async def test_estimate_nutrients_returns_dict(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=MOCK_JSON)]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.nutrition_estimator import estimate_nutrients
    result = await estimate_nutrients("pollo e riso", "omnivore", [])
    assert result["calories_kcal"] == 480
    assert result["protein_g"] == 42
    assert result["iron_mg"] == 3.2


async def test_estimate_nutrients_all_13_keys_present(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=MOCK_JSON)]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.nutrition_estimator import estimate_nutrients
    result = await estimate_nutrients("pasta al tonno", "omnivore", [])
    expected_keys = {
        "calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g",
        "sugar_g", "sodium_mg", "cholesterol_mg", "iron_mg",
        "vitamin_b12_ug", "vitamin_d_ug", "vitamin_c_mg", "calcium_mg",
    }
    assert expected_keys == set(result.keys())


async def test_estimate_nutrients_uses_diet_and_allergies_in_prompt(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text=MOCK_JSON)]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.nutrition_estimator import estimate_nutrients
    await estimate_nutrients("lenticchie e riso", "vegetarian", ["latticini"])
    call_args = mock_anthropic_client.messages.create.call_args
    prompt_text = call_args.kwargs["messages"][0]["content"]
    assert "vegetarian" in prompt_text
    assert "latticini" in prompt_text


async def test_estimate_nutrients_returns_zeros_on_malformed_json(mock_anthropic_client):
    mock_response = MagicMock()
    mock_response.content = [MagicMock(text="non sono json")]
    mock_anthropic_client.messages.create = AsyncMock(return_value=mock_response)
    from backend.services.nutrition_estimator import estimate_nutrients
    result = await estimate_nutrients("qualcosa", "omnivore", [])
    # All values default to 0
    assert all(v == 0 for v in result.values())
    assert "calories_kcal" in result
