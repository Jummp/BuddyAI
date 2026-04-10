import json
from backend.services.claude import client, HAIKU_MODEL, _strip_markdown

_EXTRACTION_PROMPT = """Habit definite: {known_habits}
Analizza il testo e restituisci SOLO JSON valido — lista di azioni:
- Se l'utente logga un'attivita esistente: {{"action": "log", "name": "<habit>", "value": <numero>}}
- Se l'utente vuole creare una nuova habit/limit: {{"action": "create", "name": "<nome>", "habit_type": "habit"|"limit", "unit": "<unita>", "target": <numero>}}
In caso di errore o testo non riconoscibile: []

Testo: {text}"""


async def extract_habits(text: str, known_habits: list[str]) -> list[dict]:
    """Estrae habit e valori dal testo in linguaggio naturale via Claude Haiku.
    Restituisce lista di dict con action 'log' o 'create'.
    In caso di errore restituisce [] (non blocca il flusso).
    """
    prompt = _EXTRACTION_PROMPT.format(
        known_habits=", ".join(known_habits) if known_habits else "nessuna",
        text=text,
    )
    try:
        response = await client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = _strip_markdown(response.content[0].text)
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except Exception:
        return []
