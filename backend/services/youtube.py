import asyncio
from googleapiclient.discovery import build
from backend.config import get_settings


async def search_video(exercise_name: str) -> dict | None:
    """Cerca il miglior video tutorial per l'esercizio su YouTube.
    Restituisce {'url': ..., 'title': ...} oppure None se nessun risultato.
    """
    try:
        return await asyncio.to_thread(_sync_search, exercise_name)
    except Exception:
        return None


def _sync_search(exercise_name: str) -> dict | None:
    settings = get_settings()
    youtube = build("youtube", "v3", developerKey=settings.youtube_api_key)
    resp = youtube.search().list(
        q=f"{exercise_name} tutorial form",
        type="video",
        part="id,snippet",
        maxResults=1,
        videoDuration="medium",
    ).execute()
    items = resp.get("items", [])
    if not items:
        return None
    video_id = items[0]["id"]["videoId"]
    title = items[0]["snippet"]["title"]
    return {
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "title": title,
    }
