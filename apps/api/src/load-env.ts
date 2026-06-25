// Load .env from the repo root regardless of cwd — must be imported before config.ts
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});
