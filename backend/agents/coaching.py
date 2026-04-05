import re
import datetime
from backend.services.supabase import get_block_exercises, get_video_link, save_video_link
from backend.services.youtube import search_video

BLOCK_NAMES = {
    "A": "Posterior Chain & Core",
    "B": "Knee & Hip",
    "C": "Mobility & Skill",
}

MONTH_FOCUS = {
    1: "Movement quality",
    2: "Base strength",
    3: "Strength + stability",
    4: "Power",
    5: "Advanced control",
    6: "Integration",
}

# Weekday → block: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
_WEEKDAY_BLOCK = {0: "A", 1: "B", 2: "C", 3: "A", 4: "B", 5: "C", 6: "C"}


def select_block(user_input: str, current_month: int) -> str:
    """Determina il blocco da fare.
    - Se l'utente specifica ('blocco A', 'block B') → usa quello
    - Altrimenti → ruota A→B→C in base al giorno della settimana
    """
    text = user_input.lower()
    for letter in ("a", "b", "c"):
        if re.search(rf"\b(block|blocco)\s*{letter}\b", text):
            return letter.upper()
    weekday = datetime.date.today().weekday()
    return _WEEKDAY_BLOCK.get(weekday, "C")


async def build_training_context(block: str) -> str:
    """Costruisce il contesto da passare a Claude Sonnet con esercizi e video link."""
    exercises = await get_block_exercises(block)
    if not exercises:
        return f"Nessun esercizio trovato per il blocco {block}."

    lines = [f"BLOCCO {block} — {BLOCK_NAMES.get(block, block)}", ""]

    for ex in exercises:
        name = ex["exercise_name"]
        drill = ex.get("drill_id") or ""
        sets = ex.get("sets") or ""
        reps = ex.get("reps") or ""
        rest = ex.get("rest") or ""

        lines.append(f"{drill}. {name} — {sets} serie × {reps} reps — rest {rest}")

        video = await get_video_link(name)
        if video is None:
            video = await search_video(name)
            if video:
                await save_video_link(name, video["url"], video["title"], "youtube")

        if video:
            video_title = video["title"] or ""
            lines.append(f"    📹 {video['url']} ({video_title})")
        else:
            lines.append("    📹 nessun video disponibile")

    month = min(datetime.date.today().month, 6)
    focus = MONTH_FOCUS.get(month, "")
    lines.extend(["", f"Mese corrente: Month {month} — {focus}"])

    return "\n".join(lines)
