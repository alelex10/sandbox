# `packages/shared` — Zod contracts

The single source of truth for **data contracts** shared between the backend and the
frontend. It contains only Zod schemas and the types inferred from them — no business
logic, no behavior, no architecture. Think of it as a common glossary so the front and
back "speak the same language."

> **Why `shared` and not `domain`?** This package holds data contracts, nothing else. It
> imposes no architecture and has no runtime behavior — the zero-ceremony way to share
> types.

## How it works

One Zod schema gives you two things at once:

| Consumer | What it uses | How |
|----------|--------------|-----|
| Backend (`apps/api`) | **Runtime validation** | `CreateItemRequest.parse(req.body)` |
| Frontend (`apps/web`) | **Static types** | `import type { CreateItemRequest } from "shared"` |

Because each schema and its inferred type share a name, you import whichever you need:
the value (schema) for validation, the `type` for compile-time checks.

```ts
import { z } from "zod";

export const CreateItemRequest = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
});
export type CreateItemRequest = z.infer<typeof CreateItemRequest>;

export const ItemResponse = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number(),
  createdAt: z.string().datetime(), // Prisma DateTime serializes to an ISO 8601 string
});
export type ItemResponse = z.infer<typeof ItemResponse>;
```

> **`createdAt` is `z.string().datetime()`, not `z.number()`.** Prisma's `DateTime`
> serializes to an ISO 8601 string over JSON, so the response contract must match what the
> API actually sends.

## Consumed as source — no build step

`package.json` points both `main` and `types` at `src/index.ts`:

```json
{
  "name": "shared",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": { "zod": "^3.23.0" }
}
```

Both apps depend on it as `"shared": "workspace:*"` and import the **TypeScript source
directly**:

- `tsx` (API) follows the workspace symlink and loads the `.ts` at runtime.
- Vite (web) transpiles the `.ts` on the fly (with `server.fs.allow` letting it reach
  outside `apps/web`).

There is nothing to compile here for runtime. (A `dist/` may appear from editor/typecheck
tooling via project references — it is gitignored and not used at runtime.)

## Editing contracts

1. Add or change a schema in `src/index.ts`.
2. Export both the schema (value) and its `z.infer` type.
3. Validate with `.parse()` in the API; import the `type` in the web helpers.

The example `Item` contracts are placeholders — replace them with the real contracts for
each experiment.
