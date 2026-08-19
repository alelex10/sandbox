import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve every project root as an ABSOLUTE path derived from this config
// file's own location, not from `process.cwd()`. This config is loaded both
// from the repo root (`pnpm -w test`) and from inside each package when its
// own `test` script points back here with `--config ../../vitest.config.ts`
// (`pnpm --filter <pkg> test`) — a CWD-relative `root` would resolve
// differently (and wrongly) in the second case.
const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));
const pkgRoot = (relative: string) => new URL(relative, import.meta.url).pathname;

// Root Vitest config for the whole pnpm workspace. Each entry under
// `test.projects` is an independent Vitest "project" scoped to one
// workspace package, with its own root + environment.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "api",
          root: pkgRoot("./apps/api"),
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "payments",
          root: pkgRoot("./packages/payments"),
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "shared",
          root: pkgRoot("./packages/shared"),
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "web",
          root: pkgRoot("./apps/web"),
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: [`${workspaceRoot}apps/web/vitest.setup.ts`],
        },
      },
    ],
  },
});
