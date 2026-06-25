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

const app = express();
app.use(cors());
app.use(express.json());
app.use("/webhooks", webhooksRouter);
app.use("/a1", a1Router);

// Global error handler — must have 4 params so Express recognises it as error middleware
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ZodError) {
    res.status(400).json({ errors: err.issues });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(Number(process.env.API_PORT ?? 3000), () =>
  console.log(`API on :${process.env.API_PORT ?? 3000}`),
);
