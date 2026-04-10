import datetime
from backend.services.supabase import (
    get_habit_definitions,
    save_habit_definition,
    save_habit_log,
    get_weekly_habit_logs,
)
from backend.services.habit_extractor import extract_habits

_WEEKLY_KEYWORDS = {"settimana", "riepilogo", "summary", "settimanale", "questa settimana"}

_HABIT_THRESHOLD_LOW = 0.6
_LIMIT_WARN = 0.7
_LIMIT_OVER = 1.0


def _monday_of_week(date: datetime.date) -> str:
    return (date - datetime.timedelta(days=date.weekday())).isoformat()


async def get_weekly_summary(week_start: str | None = None) -> str:
    if week_start is None:
        week_start = _monday_of_week(datetime.date.today())

    logs = await get_weekly_habit_logs(week_start)
    definitions = await get_habit_definitions()

    if not definitions:
        return "Nessun dato settimanale."

    totals: dict[str, float] = {}
    for log in logs:
        name = log.get("habit_definitions", {}).get("name", "?")
        totals[name] = totals.get(name, 0) + log.get("value", 0)

    parts = []
    for hd in definitions:
        name = hd["name"]
        target = hd["target"]
        unit = hd["unit"]
        habit_type = hd["habit_type"]
        total = totals.get(name, 0)

        label = f"{name.capitalize()} {total:.0f}/{target:.0f}{unit}"

        if habit_type == "habit":
            if target > 0 and total < _HABIT_THRESHOLD_LOW * target:
                label += " — BASSO"
        elif habit_type == "limit":
            if target > 0 and total > _LIMIT_OVER * target:
                label += " — SUPERATO"
            elif target > 0 and total > _LIMIT_WARN * target:
                label += " — ATTENZIONE"

        parts.append(label)

    return "Settimana: " + " · ".join(parts) if parts else "Nessun dato settimanale."


async def process_habit(text: str) -> str:
    text_lower = text.lower()

    if any(kw in text_lower for kw in _WEEKLY_KEYWORDS):
        return await get_weekly_summary()

    definitions = await get_habit_definitions()
    known_names = [hd["name"] for hd in definitions]
    name_to_def = {hd["name"]: hd for hd in definitions}

    actions = await extract_habits(text, known_names)
    if not actions:
        return ""

    today = datetime.date.today().isoformat()
    week_start = _monday_of_week(datetime.date.today())
    result_parts = []

    for action in actions:
        if action.get("action") == "create":
            await save_habit_definition(
                name=action["name"],
                habit_type=action.get("habit_type", "habit"),
                unit=action.get("unit", ""),
                target=action.get("target", 0),
            )
            result_parts.append(
                f"Habit creata: {action['name']} ({action.get('habit_type', 'habit')}, "
                f"{action.get('target', 0)}{action.get('unit', '')}/settimana)."
            )

        elif action.get("action") == "log":
            name = action["name"]
            value = action.get("value", 0)
            hd = name_to_def.get(name)
            if hd is None:
                continue

            await save_habit_log(hd["id"], today, value, text)

            logs = await get_weekly_habit_logs(week_start)
            total = sum(
                log["value"]
                for log in logs
                if log.get("habit_definitions", {}).get("name") == name
            )

            target = hd["target"]
            unit = hd["unit"]
            habit_type = hd["habit_type"]

            label = f"{name.capitalize()} {total:.0f}/{target:.0f}{unit}"

            if habit_type == "habit":
                if target > 0 and total < _HABIT_THRESHOLD_LOW * target:
                    label += " — BASSO"
            elif habit_type == "limit":
                if target > 0 and total > _LIMIT_OVER * target:
                    label += " — SUPERATO"
                elif target > 0 and total > _LIMIT_WARN * target:
                    label += " — ATTENZIONE"

            result_parts.append(label)

    return " · ".join(result_parts)
