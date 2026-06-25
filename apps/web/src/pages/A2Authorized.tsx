import { useState, useEffect, useCallback } from "react";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { CardFormMpJs } from "../components/CardFormMpJs.js";
import { CardBrick } from "../components/CardBrick.js";
import { createA2, searchA2, listA2 } from "../api.js";
import type { SubscriptionResponse, Tokenization } from "shared";

const PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string;

type TokenizationMode = "mercadopagojs" | "brick";

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

export function A2Authorized() {
  const [tokenizationMode, setTokenizationMode] =
    useState<TokenizationMode>("mercadopagojs");

  // Card token obtained from either tokenization method — single-use, not persisted
  const [cardTokenId, setCardTokenId] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<Tokenization | null>(null);

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
  const [error, setError] = useState<Error | null>(null);
  const [createResult, setCreateResult] = useState<SubscriptionResponse | null>(null);
  const [searchResult, setSearchResult] = useState<unknown>(null);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<SubscriptionResponse[]>([]);

  const fetchHistory = useCallback(async () => {
    try {
      const rows = await listA2();
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

  function handleToken(tokenId: string) {
    setCardTokenId(tokenId);
    setTokenSource(tokenizationMode);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cardTokenId || !tokenSource) {
      setError(new Error("Tokenize the card first using one of the methods above."));
      return;
    }

    setSubmitting(true);

    try {
      const payload: Parameters<typeof createA2>[0] = {
        reason: form.reason,
        payerEmail: form.payerEmail,
        cardTokenId,
        tokenization: tokenSource,
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

      const result = await createA2(payload);
      setCreateResult(result);
      setSearchResult(null);
      // Token is single-use — clear after POST
      setCardTokenId(null);
      setTokenSource(null);
      void fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Request failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSearch() {
    if (!createResult?.id) return;
    setSearching(true);
    setError(null);
    try {
      const result = await searchA2(createResult.id);
      setSearchResult(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Search failed"));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        A.2 — Preapproval Authorized
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Creates a preapproval with{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">
          status: authorized
        </code>{" "}
        using a card token. No MP checkout redirect required.
      </p>

      {/* Tokenization selector */}
      <div className="mb-6">
        <p className="text-sm font-medium text-gray-700 mb-2">
          Step 1 — Tokenize card
        </p>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setTokenizationMode("mercadopagojs");
              setCardTokenId(null);
              setTokenSource(null);
            }}
            className={[
              "px-4 py-2 rounded text-sm font-medium border transition-colors",
              tokenizationMode === "mercadopagojs"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-gray-400",
            ].join(" ")}
          >
            MP.js v2 (custom form)
          </button>
          <button
            type="button"
            onClick={() => {
              setTokenizationMode("brick");
              setCardTokenId(null);
              setTokenSource(null);
            }}
            className={[
              "px-4 py-2 rounded text-sm font-medium border transition-colors",
              tokenizationMode === "brick"
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-gray-400",
            ].join(" ")}
          >
            Card Payment Brick
          </button>
        </div>

        <div className="border border-gray-200 rounded p-4 bg-gray-50">
          {tokenizationMode === "mercadopagojs" ? (
            <CardFormMpJs publicKey={PUBLIC_KEY} onToken={handleToken} />
          ) : (
            <CardBrick key={`brick-${tokenizationMode}`} publicKey={PUBLIC_KEY} onToken={handleToken} />
          )}
        </div>

        {cardTokenId && (
          <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Card token ready (via{" "}
            <span className="font-mono">{tokenSource}</span>). Submit the form
            below to create the subscription.
          </p>
        )}
      </div>

      {/* Subscription form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm font-medium text-gray-700">
          Step 2 — Subscription details
        </p>

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            External reference{" "}
            <span className="text-gray-400 font-normal">
              (optional — auto-generated if empty)
            </span>
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
              <span className="text-gray-400 font-normal">
                (defaults to tomorrow)
              </span>
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
            {error.message}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !cardTokenId}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? "Creating…"
            : cardTokenId
              ? "Create authorized preapproval"
              : "Tokenize card first (Step 1)"}
        </button>
      </form>

      {/* Search in MP */}
      {createResult?.id && (
        <div className="mt-4">
          <button
            onClick={handleSearch}
            disabled={searching}
            className="bg-gray-700 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? "Searching…" : "Buscar en MP"}
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
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    MP ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Tokenization
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Created at
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono break-all">{sub.id}</td>
                    <td className="px-3 py-2">{sub.status ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs break-all">
                      {sub.mpId ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {sub.tokenization ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {sub.createdAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Webhook events for a2_authorized */}
      <WebhookList method="a2_authorized" />
    </div>
  );
}
