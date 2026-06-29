import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db.js";
import { paginate, parsePagination } from "../lib/pagination.js";

export const errorsRouter = Router();

// ---------------------------------------------------------------------------
// Local helper — map a Prisma ApiErrorLog row to the wire shape
// ---------------------------------------------------------------------------

function toResponse(r: {
  id: string;
  method: string;
  path: string;
  status: number;
  message: string;
  detail: string | null;
  createdAt: Date;
}) {
  let detail: unknown = null;
  if (r.detail !== null) {
    try {
      detail = JSON.parse(r.detail);
    } catch {
      detail = null;
    }
  }
  return {
    id: r.id,
    method: r.method,
    path: r.path,
    status: r.status,
    message: r.message,
    detail,
    createdAt: r.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// GET /errors  — list error log rows (newest first)
// Query params:
//   page   — integer, default 1
//   limit  — integer, default 50, max 200
//   status — exact integer match
//   path   — prefix match (startsWith)
// ---------------------------------------------------------------------------

errorsRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = parsePagination(req.query, {
      maxLimit: 200,
      defaultLimit: 50,
    });

    const statusNum = Number(req.query.status);
    const status =
      req.query.status !== undefined && Number.isFinite(statusNum)
        ? Math.trunc(statusNum)
        : undefined;

    const pathPrefix =
      typeof req.query.path === "string" && req.query.path.length > 0
        ? req.query.path
        : undefined;

    const envelope = await paginate(
      db.apiErrorLog,
      {
        where: {
          ...(status !== undefined ? { status } : {}),
          ...(pathPrefix !== undefined ? { path: { startsWith: pathPrefix } } : {}),
        },
        orderBy: { createdAt: "desc" },
      },
      { page, limit },
    );

    res.json({
      ...envelope,
      items: envelope.items.map(toResponse),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /errors  — hard delete all error log rows
// ---------------------------------------------------------------------------

errorsRouter.delete("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const r = await db.apiErrorLog.deleteMany({});
    res.json({ ok: true, count: r.count });
  } catch (err) {
    next(err);
  }
});
