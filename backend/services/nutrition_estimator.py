import json
from backend.services.claude import client, HAIKU_MODEL, _strip_markdown

_NUTRIENT_KEYS = [
    "calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g",
    "sugar_g", "sodium_mg", "cholesterol_mg", "iron_mg",
    "vitamin_b12_ug", "vitamin_d_ug", "vitamin_c_mg", "calcium_mg",
]

_ZERO_NUTRIENTS = {k: 0 for k in _NUTRIENT_KEYS}

_ESTIMATION_PROMPT = """Stima i nutrienti del seguente pasto. Dieta: {diet_type}. Allergie: {allergies}.
Restituisci SOLO JSON valido con esattamente questi campi (usa 0 se non stimabile):
calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, cholesterol_mg, iron_mg, vitamin_b12_ug, vitamin_d_ug, vitamin_c_mg, calcium_mg

Pasto: {meal_description}"""


async def estimate_nutrients(meal_description: str, diet_type: str, allergies: list[str]) -> dict:
    """Stima i nutrienti di un pasto in linguaggio naturale via Claude Haiku.
    Restituisce un dict con tutti i 13 campi nutrients.
    In caso di errore restituisce tutti 0 (non blocca il flusso).
    """
    allergies_str = ", ".join(allergies) if allergies else "nessuna"
    prompt = _ESTIMATION_PROMPT.format(
        diet_type=diet_type,
        allergies=allergies_str,
        meal_description=meal_description,
    )
    try:
        response = await client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = _strip_markdown(response.content[0].text)
        data = json.loads(raw)
        return {k: data.get(k, 0) for k in _NUTRIENT_KEYS}
    except Exception:
        return dict(_ZERO_NUTRIENTS)
