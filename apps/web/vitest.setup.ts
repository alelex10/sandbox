import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// `test.globals` is intentionally OFF (tests import `describe`/`it`/`expect`
// explicitly), so @testing-library/react's own auto-cleanup (which relies on
// detecting a global `afterEach`) never registers. Wire it manually so each
// component test starts from an empty jsdom document.
afterEach(() => {
  cleanup();
});
