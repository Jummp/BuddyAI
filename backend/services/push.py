import httpx
from backend.services.supabase import get_push_token

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


async def send_push(title: str, body: str, data: dict | None = None) -> dict:
    """Invia una notifica push via Expo Push API.
    Recupera il token dal DB. Se nessun token registrato, ritorna no-op.
    """
    token = await get_push_token()
    if not token:
        return {"sent": False, "reason": "missing_push_token"}

    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
    }
    if data:
        payload["data"] = data

    async with httpx.AsyncClient() as client:
        response = await client.post(
            EXPO_PUSH_URL,
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=10.0,
        )
    try:
        response_data = response.json()
    except ValueError:
        response_data = {"raw": response.text}
    result = {"sent": response.is_success, "status_code": response.status_code, "expo": response_data}
    if not response.is_success:
        print(f"[push] Expo push failed: {result}")
    elif isinstance(response_data, dict):
        expo_data = response_data.get("data")
        if isinstance(expo_data, dict) and expo_data.get("status") == "error":
            result["sent"] = False
            print(f"[push] Expo push error: {result}")
    return result
