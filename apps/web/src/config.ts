import { z } from "zod";

/**
 * Environment variable schema for the web app (Vite).
 * Mirrors apps/api/src/config.ts: validate everything once, fail loud on bad input.
 *
 * MercadoPago credentials are environment-bound: a public key prefixed with
 * "TEST-" only tokenizes test cards, while "APP_USR-" tokenizes real cards.
 * Validating the prefix here surfaces a wrong/mismatched key at boot instead of
 * as an opaque "No pudimos obtener la información de pago" inside the Brick.
 */
const envSchema = z.object({
  VITE_MP_PUBLIC_KEY: z
    .string()
    .min(1, "VITE_MP_PUBLIC_KEY is required")
    .refine(
      (v) => v.startsWith("TEST-") || v.startsWith("APP_USR-"),
      "VITE_MP_PUBLIC_KEY must start with 'TEST-' (test) or 'APP_USR-' (production)",
    ),
  VITE_API_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // Throwing at module load stops the app from booting with bad env, so the
  // problem is visible immediately in the console instead of at payment time.
  throw new Error(`Invalid frontend environment variables:\n${issues}`);
}

export const env = parsed.data;

export type MpEnvironment = "test" | "production";

/** Derived from the public key prefix — "test" for TEST-, "production" for APP_USR-. */
export const mpEnvironment: MpEnvironment = env.VITE_MP_PUBLIC_KEY.startsWith(
  "APP_USR-",
)
  ? "production"
  : "test";

export const isProductionMp = mpEnvironment === "production";

/** Public key for the MercadoPago JS SDK / Bricks. */
export const MP_PUBLIC_KEY = env.VITE_MP_PUBLIC_KEY;

/** Base URL of the API. */
export const API_URL = env.VITE_API_URL;

if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    `[config] MercadoPago environment: ${mpEnvironment.toUpperCase()} (public key prefix "${
      mpEnvironment === "production" ? "APP_USR-" : "TEST-"
    }")`,
  );
}
