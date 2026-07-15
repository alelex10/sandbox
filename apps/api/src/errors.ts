/**
 * Error normalization and persistence for the global handler.
 *
 * MercadoPago SDK / fetch errors arrive in several shapes (message string, `cause`
 * array, `status`/`statusCode`, nested `apiResponse`). This flattens them into a
 * consistent { status, message, detail } so the API can return the REAL error to
 * the frontend instead of an opaque "Internal server error".
 *
 * This is a dev sandbox — surfacing error detail to the client is intentional.
 */
export interface NormalizedError {
  status: number;
  message: string;
  detail?: unknown;
  name?: string;
}

function pickStatus(e: Record<string, unknown>): number | undefined {
  const raw =
    e.status ??
    e.statusCode ??
    (e.apiResponse as Record<string, unknown> | undefined)?.status ??
    (e.cause as Record<string, unknown> | undefined)?.status;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && n >= 400 && n <= 599 ? n : undefined;
}

export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    const e = err as unknown as Record<string, unknown>;
    const status = pickStatus(e) ?? 500;
    // MP SDK puts the API error array/object under `cause`; mpFetch encodes the
    // upstream body inside the message string itself.
    const detail =
      e.cause ??
      (e.apiResponse as Record<string, unknown> | undefined)?.content ??
      (e.response as Record<string, unknown> | undefined)?.data ??
      undefined;
    return {
      status,
      message: err.message || "Unknown error",
      detail,
      name: err.name,
    };
  }

  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    return {
      status: pickStatus(e) ?? 500,
      message:
        (typeof e.message === "string" && e.message) ||
        (typeof e.error === "string" && e.error) ||
        "Unknown error",
      detail: e.cause ?? e,
    };
  }

  return { status: 500, message: String(err) };
}

// ---------------------------------------------------------------------------
// Error log persistence — fire-and-forget helper
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";

const DETAIL_CAP = 8192;

/**
 * Persist one ApiErrorLog row to the database.
 *
 * This function is designed to be called fire-and-forget (`void logApiError(...).catch(() => {})`).
 * It NEVER throws: all internal errors are caught and logged to console only.
 *
 * SAFETY: MP SDK error bodies (cause / apiResponse.content) never echo the
 * access token back to callers, so message + detail are safe to persist without scrubbing.
 */
export async function logApiError(
  db: PrismaClient,
  payload: { method: string; path: string; status: number; message: string; detail?: unknown },
): Promise<void> {
  try {
    let detail: string | null = null;
    if (payload.detail !== undefined && payload.detail !== null) {
      try {
        const s = JSON.stringify(payload.detail);
        detail = s.length > DETAIL_CAP ? s.slice(0, DETAIL_CAP) : s;
      } catch {
        detail = "[unserializable detail]";
      }
    }
    await db.apiErrorLog.create({
      data: {
        method: payload.method,
        path: payload.path,
        status: payload.status,
        message: payload.message,
        detail,
      },
    });
  } catch (e) {
    console.error("[error-log] persist failed", e);
  }
}
