import { useState } from "react";
import type { PaymentDiagResponse } from "shared";
import { Card } from "./Card.js";
import { JsonViewer } from "./JsonViewer.js";
import { getSubscriptionPayments, getRecentPayments } from "../api.js";

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

function PaymentRow({ payment }: { payment: PaymentDiagResponse }) {
  const [expanded, setExpanded] = useState(false);

  const date = payment.dateCreated
    ? new Date(payment.dateCreated).toLocaleString()
    : "—";

  const amount =
    payment.amount != null
      ? `${payment.currency ?? ""} ${payment.amount.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
        })}`
      : "—";

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
        <td className="px-3 py-2 text-xs text-gray-400 text-right">
          {expanded ? "▲" : "▼"}
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

function PaymentsTable({ payments }: { payments: PaymentDiagResponse[] }) {
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
            <PaymentRow key={p.id} payment={p} />
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentDiagResponse[] | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [diagErrors, setDiagErrors] = useState<string[]>([]);

  async function handleConsult() {
    setLoading(true);
    setError(null);
    try {
      const result = await getSubscriptionPayments(subscriptionId);
      setPayments(result.payments);
      setSources(result.sources ?? []);
      setDiagErrors(result.errors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar pagos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Pagos en MP (status_detail)">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void handleConsult()}
            disabled={loading}
            className="bg-indigo-600 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Consultando…" : "Consultar pagos"}
          </button>
          {payments !== null && !loading && (
            <span className="text-xs text-gray-400">
              {payments.length} resultado{payments.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {payments !== null && <PaymentsTable payments={payments} />}

        {sources.length > 0 && (
          <details className="text-xs text-gray-400 mt-1">
            <summary className="cursor-pointer select-none hover:text-gray-600">
              Fuentes consultadas ({sources.length})
            </summary>
            <ul className="mt-1 pl-4 space-y-0.5">
              {sources.map((s) => (
                <li key={s} className="font-mono">{s}</li>
              ))}
            </ul>
          </details>
        )}

        {diagErrors.length > 0 && (
          <details className="text-xs text-orange-500 mt-1">
            <summary className="cursor-pointer select-none hover:text-orange-700">
              Errores parciales ({diagErrors.length})
            </summary>
            <ul className="mt-1 pl-4 space-y-0.5">
              {diagErrors.map((e) => (
                <li key={e} className="font-mono">{e}</li>
              ))}
            </ul>
          </details>
        )}
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
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentDiagResponse[] | null>(null);

  async function handleFetch() {
    setLoading(true);
    setError(null);
    try {
      const result = await getRecentPayments(10);
      setPayments(result.payments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al consultar pagos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="Pagos recientes de MP">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!open) {
                setOpen(true);
                void handleFetch();
              } else {
                void handleFetch();
              }
            }}
            disabled={loading}
            className="bg-gray-700 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Consultando…" : "Ver últimos 10 pagos"}
          </button>
          {payments !== null && !loading && (
            <span className="text-xs text-gray-400">
              {payments.length} resultado{payments.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        {open && payments !== null && <PaymentsTable payments={payments} />}
      </div>
    </Card>
  );
}
