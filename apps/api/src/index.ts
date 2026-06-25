// Load .env from the repo root regardless of cwd — must be first
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { webhooksRouter } from "./routes/webhooks.js";
import { a1Router } from "./routes/a1.js";
import { a2Router } from "./routes/a2.js";
import { a3Router } from "./routes/a3.js";
import { bRouter } from "./routes/b.js";
import { env } from "./config.js";

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

app.use("/webhooks", webhooksRouter);
app.use("/a1", a1Router);
app.use("/a2", a2Router);
app.use("/a3", a3Router);
app.use("/b", bRouter);

// Global error handler — must have 4 params so Express recognises it as error middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ZodError) {
    // ZodError from config validation or request validation
    const isConfigError = err.issues.some(issue => 
      issue.path.length === 1 && typeof issue.path[0] === 'string' && 
      issue.path[0].toUpperCase() === issue.path[0]
    );
    
    if (isConfigError) {
      // Configuration error - missing or invalid env vars
      res.status(500).json({ 
        error: "Configuration error", 
        details: err.issues.map(i => `${i.path.join('.')}: ${i.message}`),
        message: "Server is misconfigured. Contact administrator."
      });
      return;
    }
    
    // Request validation error
    res.status(400).json({ errors: err.issues });
    return;
  }
  
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.API_PORT, () =>
  console.log(`API on :${env.API_PORT}`),
);
