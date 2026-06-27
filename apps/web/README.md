# `apps/web` — React + Vite frontend

The frontend. A minimal React app booted by Vite, with **typed `fetch` helpers** that
import their request/response types straight from the [`shared`](../../packages/shared/README.md)
package. No router and no global state by default — add them per experiment if needed.

## Quick start

The API must be running (`pnpm --filter api dev`) for data to load.

```bash
pnpm --filter web dev     # start the Vite dev server (default http://localhost:5173)
pnpm --filter web build   # type-aware production build into dist/
```

## Layout

```
apps/web/
├── package.json        # deps + scripts (dev, build)
├── tsconfig.json       # extends ../../tsconfig.base.json
├── vite.config.ts      # react() plugin + fs.allow for the shared package
├── index.html          # Vite entry, loads /src/main.tsx
└── src/
    ├── main.tsx        # React root (StrictMode)
    ├── App.tsx         # demo UI: create + list items
    └── api.ts          # typed fetch helpers against the API
```

## How it fits together

| File | Responsibility |
|------|----------------|
| `index.html` | Vite's entry document; mounts `#root` and loads `src/main.tsx`. |
| `src/main.tsx` | Creates the React root and renders `<App />` in `StrictMode`. |
| `src/App.tsx` | Example UI — a form that creates an item and a list that shows them. Replace per experiment. |
| `src/api.ts` | `createItem()` / `listItems()` — thin `fetch` wrappers typed with `shared`. |

### The typed contract in action

`api.ts` imports the **same types** the backend validates against, so the request body
and response shape are checked at compile time on both sides:

```ts
import type { CreateItemRequest, ItemResponse } from "shared";

const API = "http://localhost:3000";

export const createItem = (body: CreateItemRequest): Promise<ItemResponse> =>
  fetch(`${API}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

export const listItems = (): Promise<ItemResponse[]> =>
  fetch(`${API}/items`).then((r) => r.json());
```

> The API base URL is hardcoded to `http://localhost:3000`. The backend enables CORS so
> this cross-origin call (Vite `:5173` → API `:3000`) works in dev. For a single-origin
> setup you could instead add a Vite proxy and use relative paths.

## Vite config notes

```ts
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ["../.."] } }, // let Vite serve packages/shared TS source
});
```

`server.fs.allow: ["../.."]` is required because `packages/shared` lives **outside**
`apps/web`. Vite's strict file-serving would block it otherwise. Vite transpiles the
shared TypeScript source on the fly — no build step for `shared`.

## Dependencies

| Runtime | Purpose |
|---------|---------|
| `react`, `react-dom` (18.x) | UI runtime. |
| `shared` (`workspace:*`) | Shared types for the API helpers. |

| Dev | Purpose |
|-----|---------|
| `vite` (6.x), `@vitejs/plugin-react` | Dev server + build + JSX/Fast Refresh. |
| `typescript`, `@types/react`, `@types/react-dom` | Types. |

## Scripts

| Script | Command | What it does |
|--------|---------|--------------|
| `dev` | `vite` | Dev server with Hot Module Replacement. |
| `build` | `vite build` | Bundles into `dist/` (gitignored). |
