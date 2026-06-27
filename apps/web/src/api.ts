import type {
  SubscriptionMethod,
  WebhookEventResponse,
  CreateA1Request,
  CreateA2Request,
  CreatePlanRequest,
  SubscribeToPlanRequest,
  SubscriptionResponse,
  SubscriptionDetailResponse,
  PlanDetailResponse,
  CreatePaymentProfileRequest,
  ChargeOrderRequest,
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
    const errorData = err as { error?: string };
    throw new Error(errorData.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const errorData = err as { error?: string };
    throw new Error(errorData.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const errorData = err as { error?: string };
    throw new Error(errorData.error ?? res.statusText);
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

export function getA1Detail(id: string): Promise<SubscriptionDetailResponse> {
  return get<SubscriptionDetailResponse>(`/a1/${encodeURIComponent(id)}`);
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

export function getA2Detail(id: string): Promise<SubscriptionDetailResponse> {
  return get<SubscriptionDetailResponse>(`/a2/${encodeURIComponent(id)}`);
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
  rawLastSearch: unknown;
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

export function getPlanDetail(id: string): Promise<PlanDetailResponse> {
  return get<PlanDetailResponse>(`/a3/plans/${encodeURIComponent(id)}`);
}

export function searchPlan(id: string): Promise<unknown> {
  return get<unknown>(`/a3/plans/${encodeURIComponent(id)}/mp`);
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

export function getA3Detail(id: string): Promise<SubscriptionDetailResponse> {
  return get<SubscriptionDetailResponse>(`/a3/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// B — Orders / Automatic Payments
// ---------------------------------------------------------------------------

export interface OrderChargeResponse {
  id: string;
  subscriptionId: string;
  mpOrderId: string | null;
  amount: number;
  status: string | null;
  sequenceNumber: number | null;
  rawResponse: unknown;
  createdAt: string;
}

export interface BSubscriptionResponse {
  id: string;
  method: string;
  status: string | null;
  paymentProfileId: string | null;
  customerId: string | null;
  tokenization: string | null;
  rawCreate: unknown;
  createdAt: string;
  charges: OrderChargeResponse[];
  events: WebhookEventResponse[];
}

export interface CreateProfileResponse {
  id: string;
  method: string;
  status: string | null;
  paymentProfileId: string | null;
  customerId: string | null;
  tokenization: string | null;
  rawCreate: unknown;
  createdAt: string;
}

export function createProfile(
  body: CreatePaymentProfileRequest,
): Promise<CreateProfileResponse> {
  return post<CreateProfileResponse>("/b/profiles", body);
}

export function chargeNow(body: ChargeOrderRequest): Promise<OrderChargeResponse> {
  return post<OrderChargeResponse>("/b/charge", body);
}

export function listB(): Promise<BSubscriptionResponse[]> {
  return get<BSubscriptionResponse[]>("/b");
}

export function listCharges(subscriptionId: string): Promise<OrderChargeResponse[]> {
  return get<OrderChargeResponse[]>(`/b/${encodeURIComponent(subscriptionId)}/charges`);
}

export function getBDetail(id: string): Promise<SubscriptionDetailResponse> {
  return get<SubscriptionDetailResponse>(`/b/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------------------
// Soft-delete helpers
// ---------------------------------------------------------------------------

export function deleteA1(id: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/a1/${encodeURIComponent(id)}`);
}

export function deleteA2(id: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/a2/${encodeURIComponent(id)}`);
}

export function deleteA3(id: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/a3/${encodeURIComponent(id)}`);
}

export function deleteB(id: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/b/${encodeURIComponent(id)}`);
}

export function deletePlan(id: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/a3/plans/${encodeURIComponent(id)}`);
}

export { post, get, del };
