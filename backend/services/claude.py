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
- free_training_log: l'utente menziona attività fisica libera fatta (flessioni, corsa, yoga, nuoto, camminata, palestra, ciclismo, ecc.) NON legata al blocco programmato
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
Se testo è molto corto, NON scrivere che è troppo breve: usa direttamente parole originali come summary.
Il summary deve stare sempre in massimo 2 righe, senza prefazioni o spiegazioni meta.

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


def _compact_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _normalize_tags(tags: list[str] | None, source_text: str) -> list[str]:
    seen: set[str] = set()
    normalized: list[str] = []

    def _push(tag: str) -> None:
        cleaned = re.sub(r"[^0-9A-Za-zÀ-ÿ]+", "-", str(tag).lower()).strip("-")
        if (
            not cleaned
            or cleaned in {"narratore", "conversazione", "dialogo"}
            or cleaned in seen
        ):
            return
        seen.add(cleaned)
        normalized.append(cleaned)

    for tag in tags or []:
        _push(tag)

    if not normalized:
        for word in re.findall(r"[0-9A-Za-zÀ-ÿ']+", source_text.lower()):
            if len(word) >= 3:
                _push(word)
            if len(normalized) == 3:
                break

    return normalized[:3]


def _default_entities() -> dict:
    return {"events": [], "people": [], "emotions": [], "topics": []}


def _normalize_summary(source_text: str, summary: str) -> str:
    source = _compact_text(source_text)
    candidate = _compact_text(summary)
    if len(source.split()) <= 4 or len(source) <= 40:
        return source

    blocked_phrases = (
        "troppo breve",
        "too short",
        "nessun riassunto significativo",
        "non è possibile estrarre",
    )
    if not candidate or any(phrase in candidate.lower() for phrase in blocked_phrases):
        return source[:220].strip()

    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+", candidate) if part.strip()]
    compact = " ".join(sentences[:2]).strip()
    return compact[:220].strip() or source[:220].strip()


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
    compact_text = _compact_text(text)
    if len(compact_text.split()) <= 4 or len(compact_text) <= 40:
        return compact_text, _normalize_tags([], compact_text), _default_entities()

    response = await client.messages.create(
        model=HAIKU_MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": f"{_MEMORY_PROMPT}\n{text}"}],
    )
    await _track(HAIKU_MODEL, response.usage, "memory")
    raw = _strip_markdown(response.content[0].text)
    try:
        data = json.loads(raw)
        return (
            _normalize_summary(compact_text, data.get("summary", "")),
            _normalize_tags(data.get("tags", []), compact_text),
            data.get("entities") or _default_entities(),
        )
    except (json.JSONDecodeError, KeyError) as e:
        raise ValueError(f"Memory extraction fallita: {raw}") from e
