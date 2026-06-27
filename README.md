# Sandbox Boilerplate (Express + React + SQLite)

A reusable, zero-ceremony skeleton for spinning up small experiments that consume an
external API with a **simple frontend + backend and local persistence**. Clone the
structure, write your logic, and you are iterating in minutes — no decisions about
stack or layout to re-make.

> **Guiding principle:** standard and flat over elegant. No hexagonal architecture, no
> use cases, no domain layers. A handler reads at a glance: `route → logic → persist → respond`.

This repo is the **skeleton only**. Each concrete experiment (testing a specific API)
is layered on top via its own RFC — see [How to extend](#how-to-extend).

## Quick start

```bash
pnpm install          # install all 3 workspaces
pnpm db:generate      # generate the typed Prisma client
pnpm db:push          # create the SQLite file from schema.prisma
pnpm dev              # run API (tsx watch) + Web (Vite) in parallel, both hot-reloaded
```

Then open the Vite URL (default http://localhost:5173). The API runs on
http://localhost:3000. Create an item from the form and it persists in SQLite.

## What's inside

| Workspace | Role | Docs |
|-----------|------|------|
| [`apps/api`](apps/api/README.md) | Express + Prisma backend. One file per resource. | API README |
| [`apps/web`](apps/web/README.md) | React + Vite frontend. Typed `fetch` helpers. | Web README |
| [`packages/shared`](packages/shared/README.md) | Zod contracts shared by front and back. | Shared README |

```
sandbox/
├── pnpm-workspace.yaml      # workspace globs: apps/*, packages/*
├── package.json            # root scripts: dev, db:push, db:generate
├── tsconfig.base.json      # shared TS config (ESNext + bundler resolution)
├── .env.example            # template for apps/api/.env
├── apps/
│   ├── api/                # Express backend (SQLite + Prisma)
│   └── web/                # React + Vite frontend
└── packages/
    └── shared/             # Zod schemas + inferred types
```

## Root scripts

| Script | What it does |
|--------|--------------|
| `pnpm dev` | Runs every `apps/*` `dev` script in parallel (`--parallel --filter "./apps/*"`). |
| `pnpm db:push` | Proxies to `apps/api` — syncs `schema.prisma` with the SQLite DB. |
| `pnpm db:generate` | Proxies to `apps/api` — regenerates the typed Prisma client. |

## Stack decisions

| Layer | Choice | Why |
|-------|--------|-----|
| Monorepo | **pnpm workspaces** (no Turborepo/Nx) | Share types + a single `pnpm dev`. A build orchestrator is overkill for a few apps. |
| Backend | **Express + TypeScript** + `tsx watch` | Standard, flat, hot reload with no compile step. |
| Frontend | **React + Vite + TypeScript** | Fast to boot, native `fetch`, zero config. |
| Persistence | **SQLite + Prisma 6** | One file, no DB server. Migrate engines by changing `provider` + `DATABASE_URL`. |
| Contracts | **Zod** in `packages/shared` | One schema → a type (`z.infer`) for the front + runtime validation for the back. |
| Package manager | **pnpm** | Native workspaces, efficient installs. |

> **Why Prisma 6, not 7?** Prisma 7 requires an explicit generator `output`, a new
> `prisma-client` generator, generated-path imports, and (as of mid-2026) still has open
> ESM/bundling bugs that hit this exact `tsx` + Vite + ESM setup. Pinning to `^6.19.0`
> lets the reference code run verbatim and keeps the skeleton flat. Migrating later is a
> ~3-file change.

## Conventions worth knowing

| Topic | Decision |
|-------|----------|
| ESM everywhere | `apps/api` and `packages/shared` are `"type": "module"`. Relative imports use `.js` extensions (e.g. `./routes/items.js`) even though the files are `.ts` — required for ESM under `tsx`. |
| TS resolution | `tsconfig.base.json` uses `module: ESNext` + `moduleResolution: bundler`, which both `tsx` and Vite understand. |
| Shared as source | `packages/shared` points `main`/`types` at `src/index.ts`. Both apps consume the **TypeScript source directly** — no build step for `shared` at runtime. |
| Env location | The runtime `.env` lives at `apps/api/.env` (not the repo root) so Prisma's CLI and client resolve `DATABASE_URL` the same way. The root keeps `.env.example` only. |
| CORS | The API enables permissive CORS so the Vite dev server (`:5173`) can call the API (`:3000`). |

## How to extend

The skeleton never changes. For each new experiment, write an RFC that fills in only
these extension points:

1. Extra dependencies (the SDK of the API under test).
2. Real Zod contracts in [`packages/shared/src/index.ts`](packages/shared/src/index.ts).
3. Real models in [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma).
4. Real routes in [`apps/api/src/routes/`](apps/api/src/routes).
5. Experiment-specific environment variables.
6. A minimal UI in [`apps/web/src/`](apps/web/src).

## Acceptance checklist

- [ ] `pnpm install` installs the 3 workspaces without errors.
- [ ] `pnpm db:push` creates the SQLite file from the schema.
- [ ] `pnpm db:generate` generates the typed Prisma client.
- [ ] `pnpm dev` runs backend + frontend in parallel with hot reload.
- [ ] The front imports a type from `shared` and the back validates with the same schema.
- [ ] A `POST` from the front persists in SQLite and a `GET` returns it.
- [ ] Restarting the backend preserves the data.
- [ ] `.env`, `*.db` and `node_modules` are gitignored.
