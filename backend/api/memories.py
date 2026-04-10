import json
from fastapi import APIRouter, Query
from pydantic import BaseModel
from backend.services.supabase import get_memories, delete_memory, update_memory_tags
from backend.services.claude import client, SONNET_MODEL

router = APIRouter(prefix="/memories", tags=["memories"])


@router.get("")
async def list_memories(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    memory_type: str = Query(default=None),
    date_from: str = Query(default=None),
    date_to: str = Query(default=None),
):
    return await get_memories(
        limit=limit,
        offset=offset,
        memory_type=memory_type,
        date_from=date_from,
        date_to=date_to,
    )


@router.delete("/{memory_id}", status_code=204)
async def remove_memory(memory_id: str):
    await delete_memory(memory_id)


class TagsUpdate(BaseModel):
    tags: list[str]


@router.patch("/{memory_id}/tags")
async def patch_memory_tags(memory_id: str, body: TagsUpdate):
    return await update_memory_tags(memory_id, body.tags)


@router.get("/summary")
async def memories_summary(
    date_from: str = Query(...),
    date_to: str = Query(...),
):
    """Genera un riassunto AI delle memories in un periodo (settimana/mese)."""
    mems = await get_memories(limit=100, date_from=date_from, date_to=date_to)
    if not mems:
        return {"summary": "Nessuna memoria in questo periodo."}

    # Build compact text from summaries + tags
    lines = []
    for m in mems:
        tags = m.get("tags") or []
        tag_str = " ".join(f"#{t}" for t in tags)
        lines.append(f"- {m.get('summary', '')} {tag_str}")

    text = "\n".join(lines)
    prompt = (
        f"Analizza queste memorie di Jump dal {date_from} al {date_to} e crea un riassunto compatto:\n\n"
        f"{text}\n\n"
        "Rispondi in italiano senza markdown. Max 4 frasi. Includi: temi ricorrenti, persone menzionate, "
        "pattern comportamentali. Inizia direttamente con il riassunto."
    )

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"summary": response.content[0].text.strip(), "count": len(mems)}
