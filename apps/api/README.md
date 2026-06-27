# `apps/api` — Express + Prisma backend

The backend. A flat Express server where **each resource is one route file** and every
handler follows the same shape: `validate → operate → persist → respond`. Persistence is
SQLite through Prisma; data contracts come from the [`shared`](../../packages/shared/README.md)
package.

## Quick start

These commands also run from the repo root (`pnpm db:push`, etc.). Locally:

```bash
pnpm --filter api db:generate   # generate the typed Prisma client
pnpm --filter api db:push       # create/sync the SQLite DB from schema.prisma
pnpm --filter api dev           # start the server with hot reload (tsx watch)
# → "API on :3000"
```

## Layout

```
apps/api/
├── package.json          # deps + scripts (dev, db:push, db:generate)
├── tsconfig.json         # extends ../../tsconfig.base.json
├── .env                  # API_PORT + DATABASE_URL (gitignored)
├── prisma/
│   ├── schema.prisma     # datasource + models
│   └── sandbox.db        # SQLite file (created by db:push, gitignored)
└── src/
    ├── index.ts          # server bootstrap + middleware + error handler
    ├── db.ts             # PrismaClient singleton
    └── routes/
        └── items.ts      # one file per resource (example: Item)
```

## How it fits together

| File | Responsibility |
|------|----------------|
| `src/index.ts` | Creates the Express app, mounts `cors()` + `express.json()`, registers routers, installs the global error handler, and listens on `API_PORT`. |
| `src/db.ts` | Exports a single `PrismaClient` instance (`db`) imported by every route. |
| `src/routes/items.ts` | Example resource. `POST /items` validates with the shared Zod schema then persists; `GET /items` lists all rows. |
| `prisma/schema.prisma` | Declares the SQLite datasource and the `Item` model. |

### Request flow (POST /items)

1. `express.json()` parses the body.
2. The handler calls `CreateItemRequest.parse(req.body)` — the **same** Zod schema the
   frontend imports for its types.
3. On success: `db.item.create(...)` writes to SQLite and the row is returned as JSON.
4. On a validation error: the handler forwards it via `next(e)` to the global error
   handler, which responds `400` with `{ errors }`. The process never crashes.

```ts
itemsRouter.post("/", async (req, res, next) => {
  try {
    const body = CreateItemRequest.parse(req.body); // shared Zod schema
    const item = await db.item.create({ data: body });
    res.json(item);
  } catch (e) {
    next(e); // → global error handler returns 400 on ZodError
  }
});
```

> **Why the `try/catch + next(e)`?** Express 4 does not forward errors thrown in `async`
> handlers automatically — an uncaught rejection would kill the Node process (and
> `tsx watch` does not restart on runtime crashes). The catch keeps the handler readable
> while routing every error to one place.

## Environment

`apps/api/.env` (copy from the root `.env.example`):

```bash
API_PORT=3000
DATABASE_URL="file:./sandbox.db"   # resolved relative to prisma/schema.prisma → apps/api/prisma/sandbox.db
```

> Secrets (tokens, API keys for a specific experiment) live **only here**, never in the
> frontend and never committed. `.env` and `*.db` are gitignored.

## Dependencies

| Runtime | Purpose |
|---------|---------|
| `express` (4.x) | HTTP server. Pinned to 4 to keep the handler code flat. |
| `@prisma/client` (6.x) | Typed DB client. |
| `cors` | Allows the Vite dev origin to call the API. |
| `zod` | Validation + error type for the global handler. |
| `shared` (`workspace:*`) | The Zod contracts. |

| Dev | Purpose |
|-----|---------|
| `prisma` (6.x) | Schema push + client generation. |
| `tsx` | Run/watch TypeScript directly, no build step. |
| `typescript`, `@types/*` | Types. |

## Scripts

| Script | Command | What it does |
|--------|---------|--------------|
| `dev` | `tsx watch src/index.ts` | Runs the server, restarting on file changes. |
| `db:push` | `prisma db push` | Syncs the schema to SQLite (no migration files — ideal for a sandbox). |
| `db:generate` | `prisma generate` | Regenerates the typed client after editing the schema. |

## Adding a resource

1. Add the model to `prisma/schema.prisma`, then `pnpm db:push && pnpm db:generate`.
2. Add the Zod contracts to [`packages/shared/src/index.ts`](../../packages/shared/src/index.ts).
3. Create `src/routes/<resource>.ts` following the `items.ts` shape.
4. Mount it in `src/index.ts`: `app.use("/<resource>", <resource>Router)`.
