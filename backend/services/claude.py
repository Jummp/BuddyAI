import json
import re
from functools import lru_cache
from typing import AsyncGenerator
import anthropic
from backend.config import get_settings
from backend.models import IntentResult

HAIKU_MODEL = "claude-haiku-4-5-20251001"
SONNET_MODEL = "claude-sonnet-4-6"

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
- fridge_update: l'utente dice cosa ha in frigo, ha comprato ingredienti, aggiunge o rimuove alimenti dalla dispensa
- meal_suggestion: l'utente chiede cosa mangiare, cosa cucinare, vuole suggerimenti pasto

Tone disponibili:
- neutral: risposta informativa
- motivational: l'utente ha bisogno di motivazione o ha fatto qualcosa di positivo
- supportive: l'utente esprime difficoltà o emozioni negative

Messaggio:"""

_MEMORY_PROMPT = """Analizza il testo e restituisci SOLO un JSON valido:
{{"summary": "riassunto in 1-2 frasi narrative in prima persona come se fosse Jump che parla (es: Ho incontrato Sofia, abbiamo parlato del clown e del freeze, si è sentita a disagio)", "tags": ["tag1", "tag2", "tag3"], "entities": {{"events": [], "people": [], "emotions": [], "topics": []}}}}

REGOLE per tags: MASSIMO 3 tag flat lowercase. Scegli i più significativi tra nomi propri di persone e argomenti chiave (es: ["sofia", "amici", "clown"]). MAI usare "narratore", MAI usare tag generici come "conversazione" o "dialogo".

Testo:"""

_SYSTEM_PROMPTS = {
    "neutral": (
        "Sei PandorAI. Rispondi italiano. Max 2 frasi. Zero articoli. Zero markdown. "
        "Zero asterischi. Zero trattini. Solo parole essenziali. Stile telegrafico."
    ),
    "motivational": (
        "Sei PandorAI. Rispondi italiano. Max 2 frasi energiche. Zero articoli. Zero markdown. "
        "Zero asterischi. Parole essenziali."
    ),
    "supportive": (
        "Sei PandorAI. Rispondi italiano. Max 2 frasi empatiche. Zero articoli. Zero markdown. "
        "Zero asterischi. Parole essenziali."
    ),
    "nutrition": (
        "Sei PandorAI. Solo dati: kcal/prot/carbs/grassi. Zero articoli. Zero markdown. "
        "Segnala carenze diretto. Stile: 'Prot 45/150g BASSO'."
    ),
    "habit": (
        "Sei PandorAI. Solo dati habit. Zero articoli. Zero markdown. "
        "Segnala ATTENZIONE/SUPERATO/BASSO. "
        "Se tipo LIMIT: stai sotto soglia = bene. Non dire obiettivo, di LIMITE."
    ),
    "meal_suggestion": (
        "Sei PandorAI. Solo 2 piatti: SEMPLICE e COMPLESSO. Zero markdown. Zero articoli."
    ),
}


def _strip_markdown(text: str) -> str:
    """Rimuove i backtick markdown (```json ... ```) dalla risposta di Claude."""
    return re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()


def _require_anthropic_api_key() -> str:
    api_key = get_settings().anthropic_api_key
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY non configurata")
    return api_key


@lru_cache(maxsize=1)
def get_anthropic_client() -> anthropic.AsyncAnthropic:
    return anthropic.AsyncAnthropic(api_key=_require_anthropic_api_key())


class _AnthropicProxy:
    def __getattr__(self, name: str):
        return getattr(get_anthropic_client(), name)


client = _AnthropicProxy()


async def _track(model: str, usage: any, endpoint: str) -> None:
    try:
        import asyncio as _asyncio
        from backend.services.supabase import save_token_log
        _asyncio.create_task(save_token_log(model, usage.input_tokens, usage.output_tokens, endpoint))
    except Exception:
        pass


async def classify_intent(text: str) -> IntentResult:
    response = await client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=256,
        messages=[{"role": "user", "content": f"{_INTENT_PROMPT}\n{text}"}],
    )
    await _track(HAIKU_MODEL, response.usage, "classify")
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
        try:
            final = await stream.get_final_message()
            await _track(model, final.usage, "chat")
        except Exception:
            pass


async def summarize_and_extract(text: str) -> tuple[str, list[str], dict]:
    response = await client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": f"{_MEMORY_PROMPT}\n{text}"}],
    )
    await _track(HAIKU_MODEL, response.usage, "memory")
    raw = _strip_markdown(response.content[0].text)
    try:
        data = json.loads(raw)
        return data["summary"], data.get("tags", []), data["entities"]
    except (json.JSONDecodeError, KeyError) as e:
        raise ValueError(f"Memory extraction fallita: {raw}") from e
