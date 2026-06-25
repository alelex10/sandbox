import { MercadoPagoConfig } from "mercadopago";

const MP_API_BASE = "https://api.mercadopago.com";

/**
 * Returns a new SDK config instance using the MP_ACCESS_TOKEN env var.
 * Call this once per request or reuse a module-level singleton — both are safe.
 */
export function mpClient(): MercadoPagoConfig {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "MP_ACCESS_TOKEN is not set — create .env at repo root from .env.example",
    );
  }
  return new MercadoPagoConfig({ accessToken: token });
}

/**
 * Raw HTTP helper for MP API endpoints not covered by the SDK (e.g. /v1/profiles/payment, /v1/orders).
 */
export async function mpFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "MP_ACCESS_TOKEN is not set — create .env at repo root from .env.example",
    );
  }
  const url = `${MP_API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
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
  return process.env.MP_NOTIFICATION_URL || undefined;
}

export function getMpBackUrl(): string | undefined {
  return process.env.MP_BACK_URL || undefined;
}
