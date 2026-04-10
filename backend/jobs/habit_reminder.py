import datetime
from backend.services.push import send_push
from backend.services.supabase import get_habit_definitions


async def run() -> None:
    """Controlla ogni minuto quali habit hanno il reminder impostato per ora corrente.
    Per ognuna invia una notifica push.
    """
    now = datetime.datetime.now().strftime("%H:%M")
    definitions = await get_habit_definitions()

    for hd in definitions:
        reminder_time = hd.get("reminder_time")
        if not reminder_time:
            continue
        # reminder_time può arrivare come "HH:MM:SS" o "HH:MM"
        reminder_hhmm = str(reminder_time)[:5]
        if reminder_hhmm == now:
            await send_push(
                title="BuddyAI — Habit",
                body=f"Ricordati: {hd['name']}!",
                data={"type": "habit", "habit_name": hd["name"]},
            )
