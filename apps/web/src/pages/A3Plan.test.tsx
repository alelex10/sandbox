import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const { emptyEnvelope } = vi.hoisted(() => ({
  emptyEnvelope: { items: [], total: 0, page: 1, limit: 20, totalPages: 1 },
}));

vi.mock("../api.js", () => ({
  createPlan: vi.fn(),
  listA3Plans: vi.fn().mockResolvedValue(emptyEnvelope),
  getPlanDetail: vi.fn(),
  searchPlan: vi.fn(),
  subscribeToPlan: vi.fn(),
  listA3: vi.fn().mockResolvedValue(emptyEnvelope),
  searchA3: vi.fn(),
  getA3Detail: vi.fn(),
  deletePlan: vi.fn(),
  deleteA3: vi.fn(),
  deleteAllPlans: vi.fn(),
  deleteAllA3: vi.fn(),
  cancelSubscription: vi.fn(),
  previewA3Plan: vi.fn().mockResolvedValue({
    body: {},
    provenance: [],
    meta: { flow: "a3-plan", dryRun: true, mpCalled: false, dbWritten: false, counterIncremented: false },
  }),
  previewA3Subscribe: vi.fn().mockResolvedValue({
    body: {},
    provenance: [],
    meta: { flow: "a3-subscribe", dryRun: true, mpCalled: false, dbWritten: false, counterIncremented: false },
  }),
}));

import { A3Plan } from "./A3Plan.js";

describe("A3Plan — sub-view routing (planes/suscripciones stay route-driven)", () => {
  beforeEach(() => {
    navigateMock.mockClear();
  });

  it("still navigates to /a3/plans when 'Planes' is selected", () => {
    render(
      <MemoryRouter initialEntries={["/a3/subs"]}>
        <A3Plan section="subs" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Planes" }));
    expect(navigateMock).toHaveBeenCalledWith("/a3/plans");
  });

  it("still navigates to /a3/subs when 'Suscripciones' is selected", () => {
    render(
      <MemoryRouter initialEntries={["/a3/plans"]}>
        <A3Plan section="plans" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Suscripciones" }));
    expect(navigateMock).toHaveBeenCalledWith("/a3/subs");
  });

  it("does not navigate when 'Crear plan' or 'Suscribir a plan' is selected — they are not route-driven", () => {
    render(
      <MemoryRouter initialEntries={["/a3/plans"]}>
        <A3Plan section="plans" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Crear plan" }));
    fireEvent.click(screen.getByRole("tab", { name: "Suscribir a plan" }));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("offers exactly 4 tabs: Planes, Suscripciones, Crear plan, Suscribir a plan — no 'Notas' or standalone 'Solicitud MP'", () => {
    render(
      <MemoryRouter initialEntries={["/a3/plans"]}>
        <A3Plan section="plans" />
      </MemoryRouter>,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Planes",
      "Suscripciones",
      "Crear plan",
      "Suscribir a plan",
    ]);
  });
});

describe("A3Plan — 'Crear plan' full-page view: form + live request preview, no Drawer", () => {
  it("shows the plan-create form and the live 'Solicitud MP — Crear plan' panel simultaneously, at full width", async () => {
    render(
      <MemoryRouter initialEntries={["/a3/plans"]}>
        <A3Plan section="plans" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Crear plan" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Left column — the create-plan form is visible and interactive.
    expect(screen.getByPlaceholderText("Monthly premium plan")).toBeInTheDocument();
    // Right column — the live preview panel renders alongside it, not behind a Drawer.
    await waitFor(() => {
      expect(screen.getByText("Solicitud MP — Crear plan")).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("re-fetches the plan-create preview when a bound field changes, while remaining in the Crear plan view", async () => {
    const api = await import("../api.js");

    render(
      <MemoryRouter initialEntries={["/a3/plans"]}>
        <A3Plan section="plans" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Crear plan" }));

    await waitFor(() => {
      expect(api.previewA3Plan).toHaveBeenCalled();
    });
    const callsBeforeEdit = vi.mocked(api.previewA3Plan).mock.calls.length;

    const reasonInput = screen.getByPlaceholderText("Monthly premium plan");
    fireEvent.change(reasonInput, { target: { value: "My Live Plan" } });

    await waitFor(() => {
      expect(api.previewA3Plan).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "My Live Plan" }),
      );
    });
    expect(vi.mocked(api.previewA3Plan).mock.calls.length).toBeGreaterThan(callsBeforeEdit);
    // The form must still be there — the Crear plan view stayed open.
    expect(screen.getByPlaceholderText("Monthly premium plan")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe("A3Plan — 'Suscribir a plan' full-page view: form + live request preview, no Drawer", () => {
  it("shows the subscribe form and the live 'Solicitud MP — Suscribir a plan' panel simultaneously, at full width", async () => {
    render(
      <MemoryRouter initialEntries={["/a3/subs"]}>
        <A3Plan section="subs" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Suscribir a plan" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Left column — the subscribe form is visible and interactive.
    expect(screen.getByPlaceholderText("payer@example.com")).toBeInTheDocument();
    // Right column — the live preview panel renders alongside it, not behind a Drawer.
    await waitFor(() => {
      expect(screen.getByText("Solicitud MP — Suscribir a plan")).toBeInTheDocument();
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("re-fetches the subscribe preview when a bound field changes, while remaining in the Suscribir a plan view", async () => {
    const api = await import("../api.js");

    render(
      <MemoryRouter initialEntries={["/a3/subs"]}>
        <A3Plan section="subs" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Suscribir a plan" }));

    await waitFor(() => {
      expect(api.previewA3Subscribe).toHaveBeenCalled();
    });
    const callsBeforeEdit = vi.mocked(api.previewA3Subscribe).mock.calls.length;

    const payerEmailInput = screen.getByPlaceholderText("payer@example.com");
    fireEvent.change(payerEmailInput, { target: { value: "live@example.com" } });

    await waitFor(() => {
      expect(api.previewA3Subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ payerEmail: "live@example.com" }),
      );
    });
    expect(vi.mocked(api.previewA3Subscribe).mock.calls.length).toBeGreaterThan(callsBeforeEdit);
    // The form must still be there — the Suscribir a plan view stayed open.
    expect(screen.getByPlaceholderText("payer@example.com")).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
