import { MercadoPagoConfig } from "mercadopago";
import { env } from "./config.js";

const MP_API_BASE = "https://api.mercadopago.com";

/**
 * Returns a new SDK config instance using the validated MP_ACCESS_TOKEN env var.
 * Call this once per request or reuse a module-level singleton — both are safe.
 */
export function mpClient(): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken: env.MP_ACCESS_TOKEN });
}

/**
 * Raw HTTP helper for MP API endpoints not covered by the SDK (e.g. /v1/profiles/payment, /v1/orders).
 */
export async function mpFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const url = `${MP_API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      ...init.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MP API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<unknown>;
}

export type MpEnvironment = "test" | "production" | "unknown";

/** Derive the environment from a credential prefix without leaking the value. */
export function mpEnvironmentFromCredential(value: string): MpEnvironment {
  if (value.startsWith("APP_USR-")) return "production";
  if (value.startsWith("TEST-")) return "test";
  return "unknown";
}

/**
 * Mask a secret credential for display: keep the environment prefix and the last
 * 4 chars, hide everything in between. The access token is secret — never return
 * it in full.
 */
function maskCredential(value: string): string {
  const prefix = value.startsWith("APP_USR-")
    ? "APP_USR-"
    : value.startsWith("TEST-")
      ? "TEST-"
      : "";
  const last4 = value.slice(-4);
  return `${prefix}…${last4}`;
}

/** Non-secret view of the MP credentials/config the API is running with. */
export function getMpConfigInfo(): {
  accessToken: { present: boolean; environment: MpEnvironment; masked: string };
  notificationUrl: string | null;
  backUrl: string | null;
} {
  const token = env.MP_ACCESS_TOKEN;
  return {
    accessToken: {
      present: !!token,
      environment: mpEnvironmentFromCredential(token),
      masked: maskCredential(token),
    },
    notificationUrl: env.MP_NOTIFICATION_URL ?? null,
    backUrl: env.MP_BACK_URL ?? null,
  };
}

export function getMpNotificationUrl(): string | undefined {
  return env.MP_NOTIFICATION_URL;
}

export function getMpBackUrl(): string | undefined {
  return env.MP_BACK_URL;
}
