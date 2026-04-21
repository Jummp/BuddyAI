const DEFAULT_API_URL = "https://buddyai-505250600889.europe-west1.run.app";
const BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL;

const REQUEST_TIMEOUT_MS = 35000;
const RETRY_DELAY_MS = 900;

type RequestOptions = {
  retry?: boolean;
  timeoutMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientMessage(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("network request failed") ||
    text.includes("failed to fetch") ||
    text.includes("request failed") ||
    text.includes("richiesta scaduta") ||
    text.includes("timeout")
  );
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `${res.status}`;
    try {
      const json = JSON.parse(text);
      if (typeof json.detail === "string") return json.detail;
      if (typeof json.message === "string") return json.message;
    } catch {}
    return text;
  } catch {
    return `${res.status}`;
  }
}

async function request<T>(path: string, init?: RequestInit, options?: RequestOptions): Promise<T> {
  const method = init?.method ?? "GET";
  const attempts = options?.retry || method === "GET" ? 2 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
      if (!res.ok) {
        const message = await readErrorMessage(res);
        const retryableStatus = [408, 429, 502, 503, 504].includes(res.status);
        if (retryableStatus && attempt < attempts) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw new Error(message || `${method} ${path} → ${res.status}`);
      }
      if (res.status === 204) return undefined as T;
      return res.json();
    } catch (error: any) {
      const normalized =
        error?.name === "AbortError"
          ? new Error("Richiesta scaduta. Riprova.")
          : error instanceof Error
            ? error
            : new Error(String(error));
      if (attempt < attempts && isTransientMessage(normalized.message)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Richiesta non completata");
}

export async function apiGet<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, undefined, options);
}

export async function apiPost<T>(path: string, body?: object, options?: RequestOptions): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }, options);
}

export async function apiPatch<T>(path: string, body: object, options?: RequestOptions): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, options);
}

export async function apiPut<T>(path: string, body: object, options?: RequestOptions): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, options);
}

export async function apiDelete(path: string, options?: RequestOptions): Promise<void> {
  await request<void>(path, { method: "DELETE" }, options);
}

export const API_BASE = BASE_URL;
