import json
import re
from typing import AsyncGenerator
import anthropic
from backend.config import get_settings
from backend.models import IntentResult

HAIKU_MODEL = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"

client = anthropic.AsyncAnthropic(api_key=get_settings().anthropic_api_key)

_INTENT_PROMPT = """Sei un classificatore di intent per un'app companion comportamentale.
Analizza il messaggio e restituisci SOLO un JSON valido:
{{"intent": ["intent1"], "tone": "tone_value"}}

Intent disponibili (seleziona tutti quelli applicabili):
- log_memory: sempre incluso
- log_nutrition: l'utente menziona cibo, pasti, bevande, calorie
- log_task: l'utente menziona qualcosa da fare o un obiettivo
- coaching_check: l'utente esprime stato emotivo, difficoltà, o deviazioni da abitudini
- habit_update: l'utente aggiorna un habit (esercizio, lettura, ecc.)
- training_request: l'utente vuole allenarsi, chiede cosa fare oggi, menziona un blocco specifico, o chiede del suo piano di allenamento

Tone disponibili:
- neutral: risposta informativa
- motivational: l'utente ha bisogno di motivazione o ha fatto qualcosa di positivo
- supportive: l'utente esprime difficoltà o emozioni negative

Messaggio:"""

_MEMORY_PROMPT = """Analizza il testo e restituisci SOLO un JSON valido:
{{"summary": "riassunto in 1-2 frasi", "entities": {{"events": [], "people": [], "emotions": [], "topics": []}}}}

Testo:"""

_SYSTEM_PROMPTS = {
    "neutral": "Sei BuddyAI, un companion personale. Rispondi in modo chiaro e utile in italiano.",
    "motivational": "Sei BuddyAI, un companion personale. Rispondi con energia e motivazione in italiano. Riconosci i progressi dell'utente.",
    "supportive": "Sei BuddyAI, un companion personale. Rispondi con empatia e supporto in italiano. Non giudicare, aiuta l'utente a trovare una soluzione.",
    "nutrition": (
        "Sei BuddyAI. Rispondi in italiano stile telegrafico: niente articoli, solo dati essenziali. "
        "Usa il contesto nutrition fornito. Segnala carenze in modo diretto. "
        "Suggerisci cibo specifico se sotto target."
    ),
}


def _strip_markdown(text: str) -> str:
    """Rimuove i backtick markdown (```json ... ```) dalla risposta di Claude."""
    return re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()


async def classify_intent(text: str) -> IntentResult:
    response = await client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": f"{_INTENT_PROMPT}\n{text}"}],
    )
    raw = _strip_markdown(response.content[0].text)
    try:
        data = json.loads(raw)
        return IntentResult(intent=data["intent"], tone=data["tone"])
    except (json.JSONDecodeError, KeyError) as e:
        raise ValueError(f"Intent classification fallita: {raw}") from e


async def stream_response(
    messages: list[dict],
    model: str,
    tone: str,
    extra_system: str = "",
) -> AsyncGenerator[str, None]:
    system = _SYSTEM_PROMPTS.get(tone, _SYSTEM_PROMPTS["neutral"])
    if extra_system:
        system = f"{system}\n\n{extra_system}"
    async with client.messages.stream(
        model=model,
        max_tokens=1024,
        system=system,
        messages=messages,
    ) as stream:
        async for token in stream.text_stream:
            yield token


async def summarize_and_extract(text: str) -> tuple[str, dict]:
    response = await client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": f"{_MEMORY_PROMPT}\n{text}"}],
    )
    raw = _strip_markdown(response.content[0].text)
    try:
        data = json.loads(raw)
        return data["summary"], data["entities"]
    except (json.JSONDecodeError, KeyError) as e:
        raise ValueError(f"Memory extraction fallita: {raw}") from e
