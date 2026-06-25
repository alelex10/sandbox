import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { itemsRouter } from "./routes/items.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/items", itemsRouter);

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
