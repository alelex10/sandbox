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
  
  // Optional URLs
  MP_NOTIFICATION_URL: z.string().url().optional(),
  MP_BACK_URL: z.string().url().optional(),
});

/**
 * Parsed and validated environment variables.
 * Throws ZodError at startup if validation fails.
 */
export const env = envSchema.parse(process.env);
