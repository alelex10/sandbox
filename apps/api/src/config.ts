import { z } from "zod";

/**
 * Environment variable schema for the API.
 * Validates required and optional configuration at startup.
 */
const envSchema = z.object({
  // Required
  MP_ACCESS_TOKEN: z.string().min(1, "MP_ACCESS_TOKEN is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  
  // Optional with defaults
  API_PORT: z.string().default("3000").transform(Number),
  
  // Optional URLs — treat an empty string as "not set" so a blank
  // line in .env is valid (optional() alone only accepts undefined).
  MP_NOTIFICATION_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
  MP_BACK_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().url().optional(),
  ),
});

let _env: z.infer<typeof envSchema> | null = null;

export function validateEnv(): z.infer<typeof envSchema> {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

/**
 * Parsed and validated environment variables.
 * Call validateEnv() first before using this.
 */
export const env = new Proxy({} as z.infer<typeof envSchema>, {
  get(_target, prop) {
    if (!_env) {
      throw new Error("validateEnv() must be called before accessing env");
    }
    return _env[prop as keyof z.infer<typeof envSchema>];
  },
});
