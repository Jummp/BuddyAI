import datetime
from backend.services.supabase import (
    get_nutrition_plan,
    save_nutrition_log,
    get_weekly_nutrition,
)
from backend.services.nutrition_estimator import estimate_nutrients

_WEEKLY_KEYWORDS = {"settimana", "riepilogo", "summary", "settimanale"}

_DEFAULT_TARGETS = {
    "calories_kcal": 2000, "protein_g": 50, "carbs_g": 275,
    "fat_g": 78, "fiber_g": 28, "sugar_g": 50, "sodium_mg": 2300,
    "cholesterol_mg": 300, "iron_mg": 18, "vitamin_b12_ug": 2.4,
    "vitamin_d_ug": 15, "vitamin_c_mg": 90, "calcium_mg": 1000,
}

_NUTRIENT_LABELS = {
    "calories_kcal": ("Calorie", "kcal"),
    "protein_g": ("Prot", "g"),
    "carbs_g": ("Carbs", "g"),
    "fat_g": ("Grassi", "g"),
    "fiber_g": ("Fibre", "g"),
    "iron_mg": ("Ferro", "mg"),
    "vitamin_b12_ug": ("B12", "µg"),
    "vitamin_d_ug": ("Vit D", "µg"),
    "vitamin_c_mg": ("Vit C", "mg"),
    "calcium_mg": ("Calcio", "mg"),
}

_DEFICIENCY_THRESHOLD = 0.6  # sotto 60% del target giornaliero = BASSO

_FOOD_KEY_MAP = {
    "iron_mg": "iron",
    "vitamin_b12_ug": "vitamin_b12",
    "vitamin_d_ug": "vitamin_d",
    "vitamin_c_mg": "vitamin_c",
}


def _is_weekly_request(text: str) -> bool:
    return any(kw in text.lower() for kw in _WEEKLY_KEYWORDS)


def _compute_daily_totals(logs: list[dict]) -> dict:
    totals: dict = {}
    for log in logs:
        for k, v in log.get("nutrients", {}).items():
            totals[k] = totals.get(k, 0) + (v or 0)
    return totals


def _find_deficiencies(totals: dict, targets: dict, foods: dict) -> list[str]:
    lines = []
    for key, (label, unit) in _NUTRIENT_LABELS.items():
        target = targets.get(key, _DEFAULT_TARGETS.get(key, 0))
        if target == 0:
            continue
        current = totals.get(key, 0)
        if current < target * _DEFICIENCY_THRESHOLD:
            line = f"{label} oggi: {current}/{target}{unit} — BASSO"
            food_key = _FOOD_KEY_MAP.get(key)
            if food_key and foods.get(food_key):
                items = [f["food"] for f in foods[food_key][:2]]
                line += f"\n→ aggiungi: {' o '.join(items)}"
            lines.append(line)
    return lines


async def log_meal(text: str) -> str:
    """Log pasto o riepilogo settimanale in base al testo."""
    if _is_weekly_request(text):
        return await get_weekly_summary()

    plan = await get_nutrition_plan()
    diet_type = plan["diet_type"] if plan else "omnivore"
    allergies = plan["allergies"] if plan else []
    targets = plan["targets"] if plan else _DEFAULT_TARGETS
    foods = plan.get("foods", {}) if plan else {}

    nutrients = await estimate_nutrients(text, diet_type, allergies)
    today = datetime.date.today().isoformat()
    await save_nutrition_log(today, text, nutrients)

    # Compute today's total (including this meal)
    logs_today = await get_weekly_nutrition(today)
    daily_totals = _compute_daily_totals(logs_today)

    # Build telegraphic context
    lines = [f"Log: {text[:60]}"]
    main = (
        f"~{int(nutrients.get('calories_kcal', 0))}kcal"
        f" · {nutrients.get('protein_g', 0)}g prot"
        f" · {nutrients.get('carbs_g', 0)}g carbs"
        f" · {nutrients.get('fat_g', 0)}g grassi"
    )
    lines.append(main)

    deficiencies = _find_deficiencies(daily_totals, targets, foods)
    lines.extend(deficiencies)

    return "\n".join(lines)


async def get_weekly_summary(week_start: str | None = None) -> str:
    """Calcola media settimanale nutrienti vs target."""
    if week_start is None:
        today = datetime.date.today()
        week_start = (today - datetime.timedelta(days=today.weekday())).isoformat()

    plan = await get_nutrition_plan()
    targets = plan["targets"] if plan else _DEFAULT_TARGETS

    logs = await get_weekly_nutrition(week_start)
    if not logs:
        return "Nessun pasto registrato settimana corrente."

    days = len({log["date"] for log in logs})
    totals = _compute_daily_totals(logs)
    averages = {k: round(v / days, 1) for k, v in totals.items()}

    lines = [f"Media settimana ({days} giorni):"]
    for key, (label, unit) in _NUTRIENT_LABELS.items():
        avg = averages.get(key, 0)
        target = targets.get(key, _DEFAULT_TARGETS.get(key, 0))
        pct = int(avg / target * 100) if target else 0
        flag = " — BASSO" if pct < 60 else ""
        lines.append(f"{label}: {avg}{unit}/{target}{unit} ({pct}%){flag}")

    return "\n".join(lines)


async def generate_plan(objectives: str) -> str:
    """Usa Claude Sonnet per generare un piano nutrizionale personalizzato."""
    import json
    import re
    import anthropic
    from backend.config import get_settings
    from backend.services.supabase import save_nutrition_plan

    sonnet_client = anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key)
    prompt = f"""Genera un piano nutrizionale personalizzato in JSON con questi campi esatti:
{{
  "diet_type": "omnivore|vegetarian|vegan|other",
  "allergies": [],
  "targets": {{"calories_kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "fiber_g": 0, "sugar_g": 0, "sodium_mg": 0, "cholesterol_mg": 0, "iron_mg": 0, "vitamin_b12_ug": 0, "vitamin_d_ug": 0, "vitamin_c_mg": 0, "calcium_mg": 0}},
  "foods": {{"iron": [], "vitamin_b12": [], "vitamin_d": [], "vitamin_c": []}},
  "notes": ""
}}

Obiettivi utente: {objectives}

Restituisci SOLO JSON valido."""

    response = await sonnet_client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", response.content[0].text.strip(), flags=re.MULTILINE).strip()
    data = json.loads(raw)

    await save_nutrition_plan(
        diet_type=data.get("diet_type", "omnivore"),
        allergies=data.get("allergies", []),
        targets=data.get("targets", {}),
        foods=data.get("foods", {}),
        notes=data.get("notes", ""),
        source="generated",
    )
    return "Piano nutrizionale generato e salvato."
