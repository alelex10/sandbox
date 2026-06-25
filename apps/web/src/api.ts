import type {
  SubscriptionMethod,
  WebhookEventResponse,
  CreateA1Request,
  SubscriptionResponse,
} from "shared";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export function listWebhooks(
  method?: SubscriptionMethod | "unattributed",
): Promise<WebhookEventResponse[]> {
  const qs = method ? `?method=${encodeURIComponent(method)}` : "";
  return get<WebhookEventResponse[]>(`/webhooks${qs}`);
}

// ---------------------------------------------------------------------------
// A.1 — Preapproval Pending
// ---------------------------------------------------------------------------

export function createA1(body: CreateA1Request): Promise<SubscriptionResponse> {
  return post<SubscriptionResponse>("/a1", body);
}

export function listA1(): Promise<SubscriptionResponse[]> {
  return get<SubscriptionResponse[]>("/a1");
}

export function searchA1(id: string): Promise<unknown> {
  return get<unknown>(`/a1/${encodeURIComponent(id)}/mp`);
}

export { post, get };
