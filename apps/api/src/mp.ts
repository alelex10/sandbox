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

export function getMpNotificationUrl(): string | undefined {
  return env.MP_NOTIFICATION_URL;
}

export function getMpBackUrl(): string | undefined {
  return env.MP_BACK_URL;
}
