import logging
from backend.services.claude import summarize_and_extract
from backend.services.supabase import save_memory

logger = logging.getLogger(__name__)


async def process(text: str) -> None:
    """Extract summary, tags and entities from text and save to Supabase.
    Executed in background — failures are logged, not propagated.
    """
    try:
        summary, tags, entities = await summarize_and_extract(text)
        await save_memory(raw_text=text, summary=summary, tags=tags, entities=entities)
    except Exception as e:
        logger.error(f"Memory Agent error: {e}")
