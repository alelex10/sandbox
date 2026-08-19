import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../api.js", () => ({
  createProfile: vi.fn(),
  chargeNow: vi.fn(),
  listB: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
  getBDetail: vi.fn(),
  deleteB: vi.fn(),
  deleteAllB: vi.fn(),
  getSubscriptionPayments: vi.fn(),
  getRecentPayments: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 }),
  refundPayment: vi.fn(),
}));

import { BOrders } from "./BOrders.js";

describe("BOrders — no sub-view tabs (Notas removed)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("renders the master-detail view directly, with no tab toggle", () => {
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <BOrders />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Nuevo" })).toBeInTheDocument();
  });
});
