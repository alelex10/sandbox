import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, upsert, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../db.js", () => ({
  db: {
    counter: { findUnique, upsert, update },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ counter: { upsert, update } }),
    ),
  },
}));

import { peekNextSequence } from "./sequence.js";

describe("peekNextSequence", () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    update.mockReset();
  });

  it("returns the next value formatted as a 4-digit string without writing", async () => {
    findUnique.mockResolvedValue({ name: "a1_pending", value: 41 });

    const result = await peekNextSequence("a1_pending");

    expect(result.next).toBe("0042");
    expect(result.current).toBe(41);
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("defaults current to 0 when no Counter row exists yet (never creates one)", async () => {
    findUnique.mockResolvedValue(null);

    const result = await peekNextSequence("a2_authorized");

    expect(result.next).toBe("0001");
    expect(result.current).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("calling twice with no create in between returns the SAME peeked value (Counter row unchanged)", async () => {
    findUnique.mockResolvedValue({ name: "a1_pending", value: 5 });

    const first = await peekNextSequence("a1_pending");
    const second = await peekNextSequence("a1_pending");

    expect(first.next).toBe("0006");
    expect(second.next).toBe("0006");
    expect(upsert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
