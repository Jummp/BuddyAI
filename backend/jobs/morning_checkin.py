import random
from backend.services.push import send_push

_CHECKIN_MESSAGES = [
    "Come ti senti oggi?",
    "Cosa hai in testa stamattina?",
    "Hai dormito bene? Cosa ti aspetti da oggi?",
    "Buongiorno! Raccontami com'è iniziata la giornata.",
    "Qual è la cosa più importante per te oggi?",
]


async def run() -> None:
    """Invia notifica push check-in mattutino con messaggio casuale."""
    body = random.choice(_CHECKIN_MESSAGES)
    await send_push(
        title="BuddyAI",
        body=body,
        data={"type": "checkin"},
    )
