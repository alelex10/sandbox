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
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteResponse,
  RecentPaymentsDiagResponse,
  SubscriptionPaymentsDiagResponse,
  TunnelCheckResponse,
  ApiErrorLogResponse,
} from "shared";

import { API_URL as API } from "./config.js";

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

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
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

export function deleteWebhook(id: string): Promise<{ ok: boolean }> {
  return del<{ ok: boolean }>(`/webhooks/${encodeURIComponent(id)}`);
}

export function clearWebhooks(): Promise<{ ok: boolean; count: number }> {
  return del<{ ok: boolean; count: number }>("/webhooks");
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

// ---------------------------------------------------------------------------
// Bulk soft-delete helpers
// ---------------------------------------------------------------------------

export function deleteAllA1(): Promise<{ ok: boolean; count: number }> {
  return del<{ ok: boolean; count: number }>("/a1");
}

export function deleteAllA2(): Promise<{ ok: boolean; count: number }> {
  return del<{ ok: boolean; count: number }>("/a2");
}

export function deleteAllA3(): Promise<{ ok: boolean; count: number }> {
  return del<{ ok: boolean; count: number }>("/a3");
}

export function deleteAllB(): Promise<{ ok: boolean; count: number }> {
  return del<{ ok: boolean; count: number }>("/b");
}

export function deleteAllPlans(): Promise<{ ok: boolean; count: number }> {
  return del<{ ok: boolean; count: number }>("/a3/plans");
}

// ---------------------------------------------------------------------------
// Config / environment
// ---------------------------------------------------------------------------

export type MpEnvironment = "test" | "production" | "unknown";

export interface MpConfigInfo {
  accessToken: {
    present: boolean;
    environment: MpEnvironment;
    masked: string;
  };
  notificationUrl: string | null;
  backUrl: string | null;
}

/** Non-secret view of the MP credentials the API is running with. */
export function getMpConfig(): Promise<MpConfigInfo> {
  return get<MpConfigInfo>("/config/mp");
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function listNotes(method: SubscriptionMethod): Promise<NoteResponse[]> {
  return get<NoteResponse[]>(`/notes?method=${encodeURIComponent(method)}`);
}

export function createNote(body: CreateNoteRequest): Promise<NoteResponse> {
  return post<NoteResponse>("/notes", body);
}

export function updateNote(id: string, body: UpdateNoteRequest): Promise<NoteResponse> {
  return patch<NoteResponse>(`/notes/${encodeURIComponent(id)}`, body);
}

export function deleteNote(id: string): Promise<void> {
  // DELETE /notes returns 204 with no body. The existing del<T>() helper calls
  // res.json(), which would throw on an empty body. Use a dedicated no-body fetch.
  return fetch(`${API}/notes/${encodeURIComponent(id)}`, { method: "DELETE" }).then((res) => {
    if (!res.ok) throw new Error(res.statusText);
  });
}

// ---------------------------------------------------------------------------
// Diagnostics — MP payments inspector
// ---------------------------------------------------------------------------

/** Recent payments from MP (global, not subscription-specific). */
export function getRecentPayments(
  limit = 10,
): Promise<RecentPaymentsDiagResponse> {
  return get<RecentPaymentsDiagResponse>(
    `/diag/payments?limit=${encodeURIComponent(limit)}`,
  );
}

/** All MP payments tied to a local subscription (merged from multiple sources). */
export function getSubscriptionPayments(
  id: string,
): Promise<SubscriptionPaymentsDiagResponse> {
  return get<SubscriptionPaymentsDiagResponse>(
    `/diag/subscriptions/${encodeURIComponent(id)}/payments`,
  );
}

/** Tunnel connectivity self-check — server fetches its own public tunnel URL
 *  and verifies the response is our /webhooks/health JSON marker. */
export function checkTunnel(): Promise<TunnelCheckResponse> {
  return get<TunnelCheckResponse>("/diag/tunnel-check");
}

// ---------------------------------------------------------------------------
// Error Log
// ---------------------------------------------------------------------------

export type { ApiErrorLogResponse };

export function listErrors(
  params: { limit?: number; status?: number; path?: string } = {},
): Promise<ApiErrorLogResponse[]> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.status !== undefined) qs.set("status", String(params.status));
  if (params.path) qs.set("path", params.path);
  const s = qs.toString();
  return get<ApiErrorLogResponse[]>(`/errors${s ? `?${s}` : ""}`);
}

export function clearErrors(): Promise<{ ok: boolean; count: number }> {
  return del<{ ok: boolean; count: number }>("/errors");
}

// ---------------------------------------------------------------------------
// Actions — real MP mutations (cancel preapproval, refund payment)
// ---------------------------------------------------------------------------

export function cancelSubscription(
  id: string,
): Promise<{ ok: boolean; status: string; id: string }> {
  return post<{ ok: boolean; status: string; id: string }>(
    `/actions/subscriptions/${encodeURIComponent(id)}/cancel`,
    {},
  );
}

export function refundPayment(paymentId: string): Promise<unknown> {
  return post<unknown>(
    `/actions/payments/${encodeURIComponent(paymentId)}/refund`,
    {},
  );
}

export { post, get, del, patch };
