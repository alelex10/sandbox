import type {
  SubscriptionMethod,
  WebhookEventResponse,
  CreateA1Request,
  CreateA2Request,
  CreatePlanRequest,
  SubscribeToPlanRequest,
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

// ---------------------------------------------------------------------------
// A.2 — Preapproval Authorized
// ---------------------------------------------------------------------------

export function createA2(body: CreateA2Request): Promise<SubscriptionResponse> {
  return post<SubscriptionResponse>("/a2", body);
}

export function listA2(): Promise<SubscriptionResponse[]> {
  return get<SubscriptionResponse[]>("/a2");
}

export function searchA2(id: string): Promise<unknown> {
  return get<unknown>(`/a2/${encodeURIComponent(id)}/mp`);
}

// ---------------------------------------------------------------------------
// A.3 — Preapproval Plan
// ---------------------------------------------------------------------------

export interface PlanResponse {
  id: string;
  mpPlanId: string | null;
  reason: string | null;
  amount: number;
  currency: string;
  frequency: number;
  frequencyType: string;
  initPoint: string | null;
  rawCreate: unknown;
  createdAt: string;
}

export interface SubscribeResult {
  path: "api" | "redirect";
  id: string;
  method: string;
  mpId: string | null;
  status: string | null;
  preapprovalPlanId: string | null;
  tokenization: string | null;
  initPoint: string | null;
  rawCreate: unknown;
  rawLastSearch: unknown;
  createdAt: string;
  message?: string;
}

export function createPlan(body: CreatePlanRequest): Promise<PlanResponse> {
  return post<PlanResponse>("/a3/plans", body);
}

export function listA3Plans(): Promise<PlanResponse[]> {
  return get<PlanResponse[]>("/a3/plans");
}

export function subscribeToPlan(body: SubscribeToPlanRequest): Promise<SubscribeResult> {
  return post<SubscribeResult>("/a3/subscribe", body);
}

export function listA3(): Promise<SubscriptionResponse[]> {
  return get<SubscriptionResponse[]>("/a3");
}

export function searchA3(id: string): Promise<unknown> {
  return get<unknown>(`/a3/${encodeURIComponent(id)}/mp`);
}

export { post, get };
