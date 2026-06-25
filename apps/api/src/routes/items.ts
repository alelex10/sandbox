import { Router, NextFunction, Request, Response } from "express";
import { CreateItemRequest } from "shared";
import { db } from "../db.js";

export const itemsRouter = Router();

itemsRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateItemRequest.parse(req.body);
    const item = await db.item.create({ data: body });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

itemsRouter.get("/", async (_req, res) => {
  res.json(await db.item.findMany());
});
