import json
from backend.services.claude import client, HAIKU_MODEL, _strip_markdown

_EXTRACTION_PROMPT = """Analizza il testo e restituisci SOLO JSON valido — lista di ingredienti:
- Se l'utente aggiunge/ha ingredienti: {{"action": "add", "name": "<nome>", "quantity": <numero>, "unit": "<unita>"}}
- Se l'utente rimuove/ha finito ingredienti: {{"action": "remove", "name": "<nome>"}}
In caso di errore o testo non riconoscibile: []

Usa nomi in minuscolo singolare (es. "pollo", "latte", "pasta").
Unità: g, kg, ml, L, unità, fette, uova, ecc.

Testo: {text}"""


async def extract_fridge_items(text: str) -> list[dict]:
    """Estrae ingredienti frigo dal testo in linguaggio naturale via Claude Haiku.
    Restituisce lista di dict con action 'add' o 'remove'.
    In caso di errore restituisce [].
    """
    prompt = _EXTRACTION_PROMPT.format(text=text)
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
