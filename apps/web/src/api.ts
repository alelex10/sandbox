import type {
  SubscriptionMethod,
  WebhookEventResponse,
  CreateA1Request,
  CreateA2Request,
  CreatePlanRequest,
  UpdatePlanRequest,
  SubscribeToPlanRequest,
  SubscriptionResponse,
  SubscriptionDetailResponse,
  PlanDetailResponse,
  CreatePaymentProfileRequest,
  ChargeOrderRequest,
  CreateNoteRequest,
  UpdateNoteRequest,
  NoteResponse,
  ApiErrorLogResponse,
  PaymentDiagResponse,
  PaginationEnvelope,
  TunnelCheckResponse,
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

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "PUT",
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

/** List webhook events. Returns a `PaginationEnvelope<WebhookEventResponse>`.
 *  - `method`: filter by method. Special value `"unattributed"` returns events
 *    where `method` is null or "unknown".
 *  - `opts.subscriptionId`: only events attributed to this local id.
 *  - `opts.planId`: only events attributed to any subscription of this plan.
 *  - `opts.page` / `opts.limit`: server-side pagination. */
export function listWebhooks(
  method?: SubscriptionMethod | "unattributed",
  opts?: {
    subscriptionId?: string;
    planId?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginationEnvelope<WebhookEventResponse>> {
  const params = new URLSearchParams();
  if (method) params.set("method", method);
  if (opts?.subscriptionId) params.set("subscriptionId", opts.subscriptionId);
  if (opts?.planId) params.set("planId", opts.planId);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<PaginationEnvelope<WebhookEventResponse>>(`/webhooks${qs ? `?${qs}` : ""}`);
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

/** List A.1 subscriptions. Returns a `PaginationEnvelope<SubscriptionResponse>`. */
export function listA1(
  opts?: { page?: number; limit?: number },
): Promise<PaginationEnvelope<SubscriptionResponse>> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<PaginationEnvelope<SubscriptionResponse>>(`/a1${qs ? `?${qs}` : ""}`);
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

/** List A.2 subscriptions. Returns a `PaginationEnvelope<SubscriptionResponse>`. */
export function listA2(
  opts?: { page?: number; limit?: number },
): Promise<PaginationEnvelope<SubscriptionResponse>> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<PaginationEnvelope<SubscriptionResponse>>(`/a2${qs ? `?${qs}` : ""}`);
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

/** List A.3 plans. Returns a `PaginationEnvelope<PlanResponse>`. */
export function listA3Plans(
  opts?: { page?: number; limit?: number },
): Promise<PaginationEnvelope<PlanResponse>> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<PaginationEnvelope<PlanResponse>>(`/a3/plans${qs ? `?${qs}` : ""}`);
}

export function getPlanDetail(id: string): Promise<PlanDetailResponse> {
  return get<PlanDetailResponse>(`/a3/plans/${encodeURIComponent(id)}`);
}

export function searchPlan(id: string): Promise<unknown> {
  return get<unknown>(`/a3/plans/${encodeURIComponent(id)}/mp`);
}

export function updatePlan(id: string, body: UpdatePlanRequest): Promise<PlanResponse> {
  return put<PlanResponse>(`/a3/plans/${encodeURIComponent(id)}`, body);
}

export function subscribeToPlan(body: SubscribeToPlanRequest): Promise<SubscribeResult> {
  return post<SubscribeResult>("/a3/subscribe", body);
}

/** List A.3 subscriptions. Returns a `PaginationEnvelope<SubscriptionResponse>`. */
export function listA3(
  opts?: { page?: number; limit?: number },
): Promise<PaginationEnvelope<SubscriptionResponse>> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<PaginationEnvelope<SubscriptionResponse>>(`/a3${qs ? `?${qs}` : ""}`);
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

/** List B orders. Returns a `PaginationEnvelope<BSubscriptionResponse>`. */
export function listB(
  opts?: { page?: number; limit?: number },
): Promise<PaginationEnvelope<BSubscriptionResponse>> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<PaginationEnvelope<BSubscriptionResponse>>(`/b${qs ? `?${qs}` : ""}`);
}

/** List charges for a B subscription. Returns a `PaginationEnvelope<OrderChargeResponse>`. */
export function listCharges(
  subscriptionId: string,
  opts?: { page?: number; limit?: number },
): Promise<PaginationEnvelope<OrderChargeResponse>> {
  const params = new URLSearchParams();
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return get<PaginationEnvelope<OrderChargeResponse>>(
    `/b/${encodeURIComponent(subscriptionId)}/charges${qs ? `?${qs}` : ""}`,
  );
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

/** List notes for a method. Returns a `PaginationEnvelope<NoteResponse>`. */
export function listNotes(
  method: SubscriptionMethod,
  opts?: { page?: number; limit?: number },
): Promise<PaginationEnvelope<NoteResponse>> {
  const params = new URLSearchParams();
  params.set("method", method);
  if (opts?.page) params.set("page", String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  return get<PaginationEnvelope<NoteResponse>>(`/notes?${params}`);
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

/** Recent payments from MP (global, not subscription-specific).
 *  Returns a `PaginationEnvelope<PaymentDiagResponse>`. `?page` + `?limit`
 *  are forwarded to the backend (defaults: page=1, limit=10; cap 50). */
export function getRecentPayments(
  params: { page?: number; limit?: number } = {},
): Promise<PaginationEnvelope<PaymentDiagResponse>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const s = qs.toString();
  return get<PaginationEnvelope<PaymentDiagResponse>>(
    `/diag/payments${s ? `?${s}` : ""}`,
  );
}

/** All MP payments tied to a local subscription (merged from multiple sources).
 *  Returns a `PaginationEnvelope<PaymentDiagResponse>`. `?page` + `?limit`
 *  are forwarded to the backend (defaults: page=1, limit=20; cap 100). The
 *  server merges both MP sources, sorts desc, and slices in-memory. */
export function getSubscriptionPayments(
  id: string,
  params: { page?: number; limit?: number } = {},
): Promise<PaginationEnvelope<PaymentDiagResponse>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const s = qs.toString();
  return get<PaginationEnvelope<PaymentDiagResponse>>(
    `/diag/subscriptions/${encodeURIComponent(id)}/payments${s ? `?${s}` : ""}`,
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

/** List error log entries. Returns a `PaginationEnvelope<ApiErrorLogResponse>`. */
export function listErrors(
  params: {
    page?: number;
    limit?: number;
    status?: number;
    path?: string;
  } = {},
): Promise<PaginationEnvelope<ApiErrorLogResponse>> {
  const qs = new URLSearchParams();
  if (params.page !== undefined) qs.set("page", String(params.page));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.status !== undefined) qs.set("status", String(params.status));
  if (params.path) qs.set("path", params.path);
  const s = qs.toString();
  return get<PaginationEnvelope<ApiErrorLogResponse>>(`/errors${s ? `?${s}` : ""}`);
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

export { post, get, del, patch, put };
