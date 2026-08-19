import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RequestFieldsView } from "./RequestFieldsView.js";

function makePreview(overrides: Partial<{ body: unknown; provenance: unknown[] }> = {}) {
  return {
    body: overrides.body ?? {},
    provenance: overrides.provenance ?? [],
    meta: { flow: "a1", dryRun: true as const, mpCalled: false as const, dbWritten: false as const, counterIncremented: false as const },
  };
}

describe("RequestFieldsView", () => {
  it("renders the fully-defaulted body and provenance table once the preview resolves (empty form -> not blank)", async () => {
    const fetchPreview = vi.fn().mockResolvedValue(
      makePreview({
        body: { reason: "A.1 | checkout_pro | pending | #0001", payer_email: "preview@example.com" },
        provenance: [
          {
            path: "reason",
            source: "sequence",
            origin: "buildDefaultReason(...) seq from Counter 'a1_pending' (peek: next, may change)",
            volatile: true,
          },
        ],
      }),
    );

    render(<RequestFieldsView title="Solicitud MP" fetchPreview={fetchPreview} watch={[]} debounceMs={0} />);

    await waitFor(() => {
      expect(fetchPreview).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "reason" })).toBeInTheDocument();
    });
    expect(screen.getByText(/buildDefaultReason/)).toBeInTheDocument();
  });

  it("debounces rapid `watch` changes into a single re-fetch using the latest values", async () => {
    const fetchPreview = vi.fn().mockResolvedValue(makePreview());

    const { rerender } = render(
      <RequestFieldsView title="Solicitud MP" fetchPreview={fetchPreview} watch={["a"]} debounceMs={40} />,
    );
    rerender(<RequestFieldsView title="Solicitud MP" fetchPreview={fetchPreview} watch={["b"]} debounceMs={40} />);
    rerender(<RequestFieldsView title="Solicitud MP" fetchPreview={fetchPreview} watch={["c"]} debounceMs={40} />);

    await waitFor(() => {
      expect(fetchPreview).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an error message instead of crashing when the preview call rejects", async () => {
    const fetchPreview = vi.fn().mockRejectedValue(new Error("boom"));

    render(<RequestFieldsView title="Solicitud MP" fetchPreview={fetchPreview} watch={[]} debounceMs={0} />);

    await waitFor(() => {
      expect(screen.getByText("boom")).toBeInTheDocument();
    });
  });
});
