import { useState, useEffect, useCallback } from "react";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { createA1, searchA1, listA1 } from "../api.js";
import type { SubscriptionResponse } from "shared";

interface FormState {
  reason: string;
  payerEmail: string;
  externalReference: string;
  frequency: string;
  frequencyType: "months" | "days";
  amount: string;
  currency: string;
  startDate: string;
}

function tomorrow(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Build from LOCAL components so the input reflects the user's timezone
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

export function A1Pending() {
  const [form, setForm] = useState<FormState>({
    reason: "",
    payerEmail: "",
    externalReference: "",
    frequency: "1",
    frequencyType: "months",
    amount: "",
    currency: "ARS",
    startDate: tomorrow(),
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<SubscriptionResponse | null>(null);
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<SubscriptionResponse[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const rows = await listA1();
      setHistory(rows);
    } catch {
      // non-critical — ignore
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Parameters<typeof createA1>[0] = {
        reason: form.reason,
        payerEmail: form.payerEmail,
        autoRecurring: {
          frequency: Number(form.frequency),
          frequencyType: form.frequencyType,
          amount: Number(form.amount),
          currency: form.currency,
          startDate: form.startDate
            ? new Date(form.startDate).toISOString()
            : undefined,
        },
      };
      if (form.externalReference) {
        payload.externalReference = form.externalReference;
      }
      const result = await createA1(payload);
      setCreateResult(result);
      setSearchResult(null);
      void fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSearch() {
    if (!createResult?.id) return;
    setSearching(true);
    setError(null);
    try {
      const result = await searchA1(createResult.id);
      setSearchResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  const initPoint =
    createResult?.initPoint ??
    (createResult?.rawCreate != null &&
    typeof createResult.rawCreate === "object" &&
    "init_point" in (createResult.rawCreate as object)
      ? ((createResult.rawCreate as Record<string, unknown>)
          .init_point as string)
      : null);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        A.1 — Preapproval Pending
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Creates a preapproval with <code className="text-xs bg-gray-100 px-1 rounded">status: pending</code>.
        MP returns an <code className="text-xs bg-gray-100 px-1 rounded">init_point</code> the payer uses to authorize the subscription.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason
          </label>
          <input
            type="text"
            name="reason"
            value={form.reason}
            onChange={handleChange}
            required
            placeholder="Monthly plan"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Payer email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payer email
          </label>
          <input
            type="email"
            name="payerEmail"
            value={form.payerEmail}
            onChange={handleChange}
            required
            placeholder="payer@example.com"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* External reference (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            External reference{" "}
            <span className="text-gray-400 font-normal">(optional — auto-generated if empty)</span>
          </label>
          <input
            type="text"
            name="externalReference"
            value={form.externalReference}
            onChange={handleChange}
            placeholder="order-123"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Auto-recurring fields */}
        <fieldset className="border border-gray-200 rounded p-4 space-y-4">
          <legend className="text-sm font-medium text-gray-700 px-1">
            Auto-recurring billing
          </legend>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency
              </label>
              <input
                type="number"
                name="frequency"
                value={form.frequency}
                onChange={handleChange}
                min="1"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Frequency type
              </label>
              <select
                name="frequencyType"
                value={form.frequencyType}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="months">months</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount
              </label>
              <input
                type="number"
                name="amount"
                value={form.amount}
                onChange={handleChange}
                min="0.01"
                step="0.01"
                required
                placeholder="1000"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-28">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Currency
              </label>
              <input
                type="text"
                name="currency"
                value={form.currency}
                onChange={handleChange}
                maxLength={3}
                minLength={3}
                pattern="[A-Za-z]{3}"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start date{" "}
              <span className="text-gray-400 font-normal">(defaults to tomorrow)</span>
            </label>
            <input
              type="datetime-local"
              name="startDate"
              value={form.startDate}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Creating…" : "Create preapproval"}
        </button>
      </form>

      {/* init_point link */}
      {initPoint && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-sm font-medium text-green-800 mb-1">
            Checkout ready
          </p>
          <a
            href={initPoint}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-green-700 underline break-all hover:text-green-900"
          >
            Open MP checkout (init_point)
          </a>
        </div>
      )}

      {/* Search in MP */}
      {createResult?.id && (
        <div className="mt-4">
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-gray-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? "Searching…" : "Search in MP"}
          </button>
        </div>
      )}

      {/* Response panels */}
      {(createResult !== null || searchResult !== null) && (
        <div className="mt-4 space-y-4">
          {createResult !== null && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Create result
              </h3>
              <ResponsePanel data={createResult} />
            </div>
          )}
          {searchResult !== null && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                MP live state
              </h3>
              <ResponsePanel data={searchResult} />
            </div>
          )}
        </div>
      )}

      {/* Subscriptions history */}
      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Suscripciones creadas
          </h3>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">MP ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Created at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono break-all">{sub.id}</td>
                    <td className="px-3 py-2">{sub.status ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs break-all">{sub.mpId ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{sub.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Webhook events for a1_pending */}
      <WebhookList method="a1_pending" />
    </div>
  );
}
