import { API_BASE } from "./api";

export type SSEToken = { type: "token"; content: string };
export type SSEDone = { type: "done"; memory_saved: boolean };
export type SSEEvent = SSEToken | SSEDone;

export async function* streamChat(
  text: string,
  endpoint: "chat" | "voice" = "chat",
  audioBlob?: Blob
): AsyncGenerator<SSEEvent> {
  let body: BodyInit;
  let headers: Record<string, string> = {};

  if (endpoint === "voice" && audioBlob) {
    const form = new FormData();
    form.append("audio", audioBlob, "recording.m4a");
    body = form;
  } else {
    body = JSON.stringify({ text });
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok || !res.body) throw new Error(`Stream error: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as SSEEvent;
        yield event;
      } catch {}
    }
  }
}
