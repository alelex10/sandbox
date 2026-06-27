// Load .env from the repo root regardless of cwd — must be first
import "./load-env.js";

import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { webhooksRouter, mpWebhookHandler } from "./routes/webhooks.js";
import { a1Router } from "./routes/a1.js";
import { a2Router } from "./routes/a2.js";
import { a3Router } from "./routes/a3.js";
import { bRouter } from "./routes/b.js";
import { notesRouter } from "./routes/notes.js";
import { diagRouter } from "./routes/diag.js";
import { validateEnv, env } from "./config.js";
import { getMpConfigInfo } from "./mp.js";
import { normalizeError } from "./errors.js";

// Validate environment variables after loading .env
validateEnv();

const app = express();
app.use(cors());
app.use(express.json());

// Healthcheck endpoint - verifies env vars are loaded
app.get("/health", (_req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    config: {
      mpAccessToken: !!env.MP_ACCESS_TOKEN,
      databaseUrl: !!env.DATABASE_URL,
      apiPort: env.API_PORT,
      mpNotificationUrl: !!env.MP_NOTIFICATION_URL,
      mpBackUrl: !!env.MP_BACK_URL,
    }
  });
});

// Non-secret view of the MP credentials the API is running with (environment +
// masked token) so the UI can surface test/production mismatches.
app.get("/config/mp", (_req: Request, res: Response) => {
  res.json(getMpConfigInfo());
});

app.use("/webhooks", webhooksRouter);
app.post("/payments/mercado-pago/notification", mpWebhookHandler);
app.use("/a1", a1Router);
app.use("/a2", a2Router);
app.use("/a3", a3Router);
app.use("/b", bRouter);
app.use("/notes", notesRouter);
app.use("/diag", diagRouter);

// Global error handler — must have 4 params so Express recognises it as error middleware
app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ZodError) {
    res
      .status(400)
      .json({ error: "Validation failed", detail: err.issues, status: 400 });
    return;
  }

  // Surface the REAL error (message + MP detail) instead of a generic 500.
  const norm = normalizeError(err);
  console.error(
    `[error] ${req.method} ${req.path} → ${norm.status} ${norm.message}`,
    norm.detail ?? "",
  );
  res.status(norm.status).json({
    error: norm.message,
    detail: norm.detail ?? null,
    status: norm.status,
  });
});

app.listen(env.API_PORT, () =>
  console.log(`API on :${env.API_PORT}`),
);
