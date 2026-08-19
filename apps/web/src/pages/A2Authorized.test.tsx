import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../api.js", () => ({
  createA2: vi.fn(),
  searchA2: vi.fn(),
  listA2: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 }),
  getA2Detail: vi.fn(),
  deleteA2: vi.fn(),
  deleteAllA2: vi.fn(),
  cancelSubscription: vi.fn(),
  previewA2: vi.fn().mockResolvedValue({
    body: {},
    provenance: [],
    meta: { flow: "a2", dryRun: true, mpCalled: false, dbWritten: false, counterIncremented: false },
  }),
}));

import { A2Authorized } from "./A2Authorized.js";

describe("A2Authorized — secondary sub-nav (Lista | Crear)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("defaults to 'Lista', rendering the master-detail history view with no create Drawer", () => {
    render(
      <MemoryRouter initialEntries={["/a2"]}>
        <A2Authorized />
      </MemoryRouter>,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Lista", "Crear"]);
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Buscar por ID (GET subscription)")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("payer@example.com")).not.toBeInTheDocument();
  });

  it("switches to the full-page 'Crear' view showing both the form (incl. card tokenization) and the live preview at once, with no Drawer", async () => {
    render(
      <MemoryRouter initialEntries={["/a2"]}>
        <A2Authorized />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Crear" }));

    expect(screen.getByRole("tab", { name: "Crear" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Left column — the tokenization step + form are visible and interactive.
    expect(screen.getByText("Step 1 — Tokenize card")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("payer@example.com")).toBeInTheDocument();
    // Right column — the live preview panel renders alongside it at full width.
    await waitFor(() => {
      expect(screen.getByText("Solicitud MP")).toBeInTheDocument();
    });
    // Both visible simultaneously — no tab click needed within the Crear view.
    expect(screen.getByPlaceholderText("payer@example.com")).toBeInTheDocument();
    expect(screen.getByText("Solicitud MP")).toBeInTheDocument();
  });

  it("re-fetches the preview when a bound form field changes, while remaining in the Crear view", async () => {
    const api = await import("../api.js");

    render(
      <MemoryRouter initialEntries={["/a2"]}>
        <A2Authorized />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Crear" }));

    await waitFor(() => {
      expect(api.previewA2).toHaveBeenCalled();
    });
    const callsBeforeEdit = vi.mocked(api.previewA2).mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText("payer@example.com"), {
      target: { value: "live@example.com" },
    });

    await waitFor(() => {
      expect(api.previewA2).toHaveBeenCalledWith(
        expect.objectContaining({ payerEmail: "live@example.com" }),
      );
    });
    expect(vi.mocked(api.previewA2).mock.calls.length).toBeGreaterThan(callsBeforeEdit);
    // The form must still be there — the Crear view stayed open.
    expect(screen.getByPlaceholderText("payer@example.com")).toBeInTheDocument();
  });
});
