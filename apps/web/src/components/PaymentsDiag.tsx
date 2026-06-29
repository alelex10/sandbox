import { useCallback, useState } from "react";
import type { PaymentDiagResponse } from "shared";
import { Card } from "./Card.js";
import { JsonViewer } from "./JsonViewer.js";
import { Pagination } from "./Pagination.js";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery.js";
import { getSubscriptionPayments, getRecentPayments, refundPayment } from "../api.js";

// ---------------------------------------------------------------------------
// Status badge for payment status (approved / rejected / pending / other)
// ---------------------------------------------------------------------------

function PaymentStatusBadge({ status }: { status: string | null }) {
  const s = status ?? "unknown";
  const cls =
    s === "approved"
      ? "bg-green-100 text-green-700"
      : s === "rejected" || s === "cancelled"
        ? "bg-red-100 text-red-700"
        : s === "pending" || s === "in_process" || s === "in_mediation"
          ? "bg-gray-100 text-gray-600"
          : "bg-gray-100 text-gray-500";
  return (
    <span className={`inline-block text-xs font-medium rounded px-1.5 py-0.5 ${cls}`}>
      {s}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Single payment row (expandable to raw JSON)
// ---------------------------------------------------------------------------

function PaymentRow({
  payment,
  onRefund,
}: {
  payment: PaymentDiagResponse;
  onRefund: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [refunding, setRefunding] = useState(false);

  const date = payment.dateCreated
    ? new Date(payment.dateCreated).toLocaleString()
    : "—";

  const amount =
    payment.amount != null
      ? `${payment.currency ?? ""} ${payment.amount.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
        })}`
      : "—";

  async function handleRefund(e: React.MouseEvent) {
    e.stopPropagation();
    if (!payment.id) return;
    const confirmed = window.confirm(
      "¿Reembolsar este pago? Devuelve plata REAL al pagador.",
    );
    if (!confirmed) return;
    setRefunding(true);
    try {
      await refundPayment(String(payment.id));
      await onRefund();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo reembolsar");
    } finally {
      setRefunding(false);
    }
  }

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{date}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          <PaymentStatusBadge status={payment.status} />
        </td>
        <td className="px-3 py-2">
          <span className="text-xs font-semibold text-gray-900 font-mono">
            {payment.statusDetail ?? <span className="text-gray-400 italic">—</span>}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-gray-700 whitespace-nowrap">{amount}</td>
        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
          {payment.paymentMethodId ?? "—"}
        </td>
        <td className="px-3 py-2 text-xs text-gray-400 font-mono max-w-[10rem] truncate">
          {payment.externalReference ?? "—"}
        </td>
        <td className="px-3 py-2 text-xs text-right whitespace-nowrap">
          {payment.status === "approved" && (
            <button
              type="button"
              onClick={(e) => void handleRefund(e)}
              disabled={refunding}
              className="mr-2 text-xs font-medium text-amber-700 border border-amber-300 rounded px-2 py-0.5 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Reembolsar este pago (devuelve plata real)"
            >
              {refunding ? "Reembolsando…" : "Reembolsar"}
            </button>
          )}
          <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="px-3 pb-3 bg-gray-50">
            <JsonViewer value={payment.raw} />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Payments table
// ---------------------------------------------------------------------------

function PaymentsTable({
  payments,
  onRefund,
}: {
  payments: PaymentDiagResponse[];
  onRefund: () => Promise<void>;
}) {
  if (payments.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic py-2">Sin pagos todavía.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap">Fecha</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-500">Status</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-900">status_detail</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap">Monto</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-500 whitespace-nowrap">Medio de pago</th>
            <th className="px-3 py-2 text-xs font-semibold text-gray-500">external_reference</th>
            <th className="px-3 py-2 text-xs text-gray-300"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payments.map((p) => (
            <PaymentRow key={p.id} payment={p} onRefund={onRefund} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-subscription diagnostics card
// ---------------------------------------------------------------------------

interface PaymentsDiagProps {
  subscriptionId: string;
}

export function PaymentsDiag({ subscriptionId }: PaymentsDiagProps) {
  // Bump after a refund to re-fetch the current page from the server.
  const [refetchToken, setRefetchToken] = useState(0);

  const fetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      // depend on refetchToken so refunds trigger a re-fetch
      void refetchToken;
      return getSubscriptionPayments(subscriptionId, {
        page: p.page,
        limit: p.limit,
      });
    },
    [subscriptionId, refetchToken],
  );

  const {
    data: payments,
    page,
    setPage,
    total,
    totalPages,
    limit,
    loading,
    error,
  } = usePaginatedQuery<PaymentDiagResponse>({ fetcher, defaultLimit: 20 });

  async function handleRefund(): Promise<void> {
    setRefetchToken((n) => n + 1);
  }

  return (
    <Card title="Pagos en MP (status_detail)">
      <div className="space-y-3">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && payments.length === 0 && (
          <p className="text-sm text-gray-400 italic py-2">Sin pagos todavía.</p>
        )}

        {payments.length > 0 && (
          <PaymentsTable payments={payments} onRefund={handleRefund} />
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Global recent payments panel (standalone, no subscription required)
// ---------------------------------------------------------------------------

interface RecentPaymentsPanelProps {
  defaultOpen?: boolean;
}

export function RecentPaymentsPanel({ defaultOpen = false }: RecentPaymentsPanelProps) {
  // Bump after a refund to re-fetch the current page from the server.
  const [refetchToken, setRefetchToken] = useState(0);
  // `defaultOpen` from the prop is honored by hiding the card body until
  // the user opts in. The previous design used local `open` state; the new
  // design auto-fetches on mount but lets the consumer collapse the card.
  const [collapsed, setCollapsed] = useState(!defaultOpen);

  const fetcher = useCallback(
    async (p: { page: number; limit: number }) => {
      void refetchToken;
      return getRecentPayments({ page: p.page, limit: p.limit });
    },
    [refetchToken],
  );

  const {
    data: payments,
    page,
    setPage,
    total,
    totalPages,
    limit,
    loading,
    error,
  } = usePaginatedQuery<PaymentDiagResponse>({ fetcher, defaultLimit: 10 });

  async function handleRefund(): Promise<void> {
    setRefetchToken((n) => n + 1);
  }

  return (
    <Card title="Pagos recientes de MP">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
          >
            {collapsed ? "Mostrar" : "Ocultar"}
          </button>
          {!collapsed && !loading && (
            <span className="text-xs text-gray-400">
              {total} resultado{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {!collapsed && error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {!collapsed && !loading && !error && payments.length === 0 && (
          <p className="text-sm text-gray-400 italic py-2">Sin pagos todavía.</p>
        )}

        {!collapsed && payments.length > 0 && (
          <PaymentsTable payments={payments} onRefund={handleRefund} />
        )}

        {!collapsed && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
          />
        )}
      </div>
    </Card>
  );
}
