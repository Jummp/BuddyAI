import httpx
from backend.services.supabase import get_push_token

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push(title: str, body: str, data: dict | None = None) -> None:
    """Invia una notifica push via Expo Push API.
    Recupera il token dal DB. Se nessun token registrato → no-op silenzioso.
    """
    token = await get_push_token()
    if not token:
        return

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
    }
    if data:
        payload["data"] = data

    async with httpx.AsyncClient() as client:
        await client.post(
            EXPO_PUSH_URL,
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=10.0,
        )
