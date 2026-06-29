import { Router, Request, Response, NextFunction } from "express";
import { CreateNoteRequest, UpdateNoteRequest, SubscriptionMethod } from "shared";
import { db } from "../db.js";
import { paginate, parsePagination } from "../lib/pagination.js";

export const notesRouter = Router();

// ---------------------------------------------------------------------------
// Local helper — map a Prisma Note row to the wire shape
// ---------------------------------------------------------------------------

function toNoteResponse(n: {
  id: string;
  method: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}) {
  return {
    id: n.id,
    method: n.method,
    title: n.title,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    deletedAt: n.deletedAt ? n.deletedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// GET /notes?method=<method>&page=<n>&limit=<m>
//   — list non-deleted notes for a method, paginated
// ---------------------------------------------------------------------------

notesRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = SubscriptionMethod.safeParse(req.query.method);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid or missing method query param" });
      return;
    }

    const { page, limit } = parsePagination(req.query);
    const envelope = await paginate(
      db.note,
      {
        where: { method: parsed.data, deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
      { page, limit },
    );

    res.json({
      ...envelope,
      items: envelope.items.map(toNoteResponse),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /notes  — create a note (201)
// ---------------------------------------------------------------------------

notesRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = CreateNoteRequest.parse(req.body);

    const note = await db.note.create({
      data: {
        method: body.method,
        title: body.title,
        body: body.body,
      },
    });

    res.status(201).json(toNoteResponse(note));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /notes/:id  — update title and/or body (200)
// ---------------------------------------------------------------------------

notesRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = UpdateNoteRequest.parse(req.body);

    const existing = await db.note.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt !== null) {
      res.status(404).json({ error: "Note not found" });
      return;
    }

    const updated = await db.note.update({
      where: { id: req.params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
      },
    });

    res.status(200).json(toNoteResponse(updated));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /notes/:id  — soft-delete (204 no body)
// ---------------------------------------------------------------------------

notesRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await db.note.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deletedAt !== null) {
      res.status(404).json({ error: "Note not found" });
      return;
    }

    await db.note.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
