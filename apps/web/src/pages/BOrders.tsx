import { useState, useEffect, useCallback } from "react";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { CardFormMpJs } from "../components/CardFormMpJs.js";
import { CardBrick } from "../components/CardBrick.js";
import {
  createProfile,
  chargeNow,
  listB,
  listCharges,
} from "../api.js";
import type {
  BSubscriptionResponse,
  OrderChargeResponse,
  CreateProfileResponse,
} from "../api.js";
import type { Tokenization } from "shared";

const PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string;

type TokenizationMode = "mercadopagojs" | "brick";

// ---------------------------------------------------------------------------
// Section 1 — Register payment method (create profile)
// ---------------------------------------------------------------------------

function RegisterProfileSection({
  onProfileCreated,
}: {
  onProfileCreated: () => void;
}) {
  const [tokenizationMode, setTokenizationMode] =
    useState<TokenizationMode>("mercadopagojs");
  const [cardTokenId, setCardTokenId] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<Tokenization | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState("visa");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateProfileResponse | null>(null);

  function handleToken(tokenId: string) {
    setCardTokenId(tokenId);
    setTokenSource(tokenizationMode);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cardTokenId || !tokenSource) {
      setError("Tokenize the card first using one of the methods above.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createProfile({
        cardTokenId,
        tokenization: tokenSource,
        paymentMethodId,
      });
      setResult(created);
      // Token is single-use — clear after POST
      setCardTokenId(null);
      setTokenSource(null);
      onProfileCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mb-10">
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Sección 1 — Registrar medio de pago
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Tokenize a card and register it as a stored payment profile via{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">
          POST /v1/profiles/payment
        </code>
        . The returned{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">
          payment_profile_id
        </code>{" "}
        is used for future charges.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tokenization method selector */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Tokenization method
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
              <CardBrick
                key={`brick-${tokenizationMode}`}
                publicKey={PUBLIC_KEY}
                onToken={handleToken}
              />
            )}
          </div>

          {cardTokenId && (
            <p className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Card token ready (via{" "}
              <span className="font-mono">{tokenSource}</span>). Fill in the
              payment method and submit.
            </p>
          )}
        </div>

        {/* Payment method id */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment method id
          </label>
          <select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="visa">visa</option>
            <option value="master">master</option>
            <option value="amex">amex</option>
            <option value="naranja">naranja</option>
            <option value="cabal">cabal</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Must match the card brand. MP will reject mismatches.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !cardTokenId}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting
            ? "Registering…"
            : cardTokenId
              ? "Register payment method"
              : "Tokenize card first"}
        </button>
      </form>

      {result && (
        <div className="mt-4 space-y-3">
          {result.paymentProfileId && (
            <div className="bg-green-50 border border-green-200 rounded px-4 py-3">
              <p className="text-xs font-semibold text-green-700 mb-1 uppercase tracking-wide">
                Payment profile registered
              </p>
              <p className="text-xs text-green-800">
                Profile ID:{" "}
                <span className="font-mono break-all">
                  {result.paymentProfileId}
                </span>
              </p>
              {result.customerId && (
                <p className="text-xs text-green-800 mt-0.5">
                  Customer ID:{" "}
                  <span className="font-mono break-all">
                    {result.customerId}
                  </span>
                </p>
              )}
              <p className="text-xs text-green-800 mt-0.5">
                Status:{" "}
                <span className="font-mono">{result.status ?? "—"}</span>
              </p>
            </div>
          )}
          <ResponsePanel data={result} />
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Charge now
// ---------------------------------------------------------------------------

function ChargeSection({
  subscriptions,
}: {
  subscriptions: BSubscriptionResponse[];
}) {
  const [selectedSubId, setSelectedSubId] = useState("");
  const [amount, setAmount] = useState("");
  const [sequenceNumber, setSequenceNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chargeResult, setChargeResult] = useState<OrderChargeResponse | null>(
    null,
  );
  const [subCharges, setSubCharges] = useState<OrderChargeResponse[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(false);

  // Subscriptions with a valid paymentProfileId can be charged
  const chargeableSubs = subscriptions.filter((s) => s.paymentProfileId);

  const fetchSubCharges = useCallback(async (id: string) => {
    setLoadingCharges(true);
    try {
      const rows = await listCharges(id);
      setSubCharges(rows);
    } catch {
      // non-critical
    } finally {
      setLoadingCharges(false);
    }
  }, []);

  function handleSelectSub(id: string) {
    setSelectedSubId(id);
    setChargeResult(null);
    setSubCharges([]);
    setError(null);
    if (id) {
      void fetchSubCharges(id);
    }
  }

  async function handleCharge(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedSubId) {
      setError("Select a subscription first.");
      return;
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Parameters<typeof chargeNow>[0] = {
        subscriptionId: selectedSubId,
        amount: parsedAmount,
      };
      if (sequenceNumber) {
        payload.sequenceNumber = parseInt(sequenceNumber, 10);
      }
      const result = await chargeNow(payload);
      setChargeResult(result);
      // Refresh charge list after new charge
      void fetchSubCharges(selectedSubId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Charge failed");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedSub = subscriptions.find((s) => s.id === selectedSubId);

  return (
    <section>
      <h3 className="text-base font-semibold text-gray-900 mb-1">
        Sección 2 — Cobrar ahora
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Select a registered subscription and trigger a charge via{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">POST /v1/orders</code>.
        Each charge creates a fresh idempotency key.
      </p>

      {chargeableSubs.length === 0 ? (
        <p className="text-sm text-gray-500 italic mb-4">
          No subscriptions with a registered payment profile yet — use Section 1
          first.
        </p>
      ) : (
        <form onSubmit={handleCharge} className="space-y-4">
          {/* Subscription picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select subscription
            </label>
            <select
              value={selectedSubId}
              onChange={(e) => handleSelectSub(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— choose a subscription —</option>
              {chargeableSubs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)}… — profile:{" "}
                  {s.paymentProfileId?.slice(0, 12)}… — status:{" "}
                  {s.status ?? "?"}
                </option>
              ))}
            </select>
          </div>

          {/* Show selected subscription details */}
          {selectedSub && (
            <div className="bg-gray-50 border border-gray-200 rounded px-4 py-3 text-xs text-gray-700 space-y-0.5">
              <p>
                <span className="font-medium">Profile ID:</span>{" "}
                <span className="font-mono break-all">
                  {selectedSub.paymentProfileId}
                </span>
              </p>
              <p>
                <span className="font-medium">Customer ID:</span>{" "}
                <span className="font-mono break-all">
                  {selectedSub.customerId ?? "—"}
                </span>
              </p>
              <p>
                <span className="font-medium">Status:</span>{" "}
                {selectedSub.status ?? "—"}
              </p>
              <p>
                <span className="font-medium">Tokenization:</span>{" "}
                {selectedSub.tokenization ?? "—"}
              </p>
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0.01"
              step="0.01"
              required
              placeholder="1000.00"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Sequence number (optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sequence number{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={sequenceNumber}
              onChange={(e) => setSequenceNumber(e.target.value)}
              min="1"
              placeholder="e.g. 1 for the first charge in a series"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedSubId || !amount}
            className="w-full bg-emerald-600 text-white rounded px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Charging…" : "Cobrar ahora"}
          </button>
        </form>
      )}

      {/* Last charge result */}
      {chargeResult && (
        <div className="mt-4 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">
              Charge result
            </p>
            <p className="text-xs text-blue-800">
              Order ID:{" "}
              <span className="font-mono break-all">
                {chargeResult.mpOrderId ?? "—"}
              </span>
            </p>
            <p className="text-xs text-blue-800 mt-0.5">
              Status:{" "}
              <span className="font-mono">{chargeResult.status ?? "—"}</span>
            </p>
          </div>
          <ResponsePanel data={chargeResult} />
        </div>
      )}

      {/* Charges history for selected subscription */}
      {selectedSubId && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Charges for this subscription
          </h4>
          {loadingCharges ? (
            <p className="text-xs text-gray-400">Loading charges…</p>
          ) : subCharges.length === 0 ? (
            <p className="text-xs text-gray-400 italic">
              No charges yet for this subscription.
            </p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-xs text-gray-700">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Charge ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      MP Order ID
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Seq #
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500">
                      Created at
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {subCharges.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono break-all">
                        {c.id}
                      </td>
                      <td className="px-3 py-2">{c.amount}</td>
                      <td className="px-3 py-2">{c.status ?? "—"}</td>
                      <td className="px-3 py-2 font-mono break-all">
                        {c.mpOrderId ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {c.sequenceNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.createdAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// BOrders — main page component
// ---------------------------------------------------------------------------

export function BOrders() {
  const [subscriptions, setSubscriptions] = useState<BSubscriptionResponse[]>(
    [],
  );

  const fetchSubscriptions = useCallback(async () => {
    try {
      const rows = await listB();
      setSubscriptions(rows);
    } catch {
      // non-critical — ignore
    }
  }, []);

  useEffect(() => {
    void fetchSubscriptions();
  }, [fetchSubscriptions]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        B — Orders / Automatic Payments
      </h2>
      <p className="text-sm text-gray-500 mb-8">
        Register a card once (
        <code className="text-xs bg-gray-100 px-1 rounded">
          POST /v1/profiles/payment
        </code>
        ), then trigger charges on demand (
        <code className="text-xs bg-gray-100 px-1 rounded">
          POST /v1/orders
        </code>
        ). MP does not manage the schedule — you control each charge.
      </p>

      <RegisterProfileSection
        onProfileCreated={() => {
          void fetchSubscriptions();
        }}
      />

      <hr className="border-gray-200 my-8" />

      <ChargeSection subscriptions={subscriptions} />

      <hr className="border-gray-200 my-8" />

      {/* Medios de pago registrados (all b_orders subscriptions) */}
      {subscriptions.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Medios de pago registrados
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
                    Profile ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Customer ID
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Tokenization
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Charges
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">
                    Created at
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {subscriptions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono break-all">{s.id}</td>
                    <td className="px-3 py-2">{s.status ?? "—"}</td>
                    <td className="px-3 py-2 font-mono break-all">
                      {s.paymentProfileId ?? "—"}
                    </td>
                    <td className="px-3 py-2 font-mono break-all">
                      {s.customerId ?? "—"}
                    </td>
                    <td className="px-3 py-2">{s.tokenization ?? "—"}</td>
                    <td className="px-3 py-2">{s.charges.length}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {s.createdAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Webhook events */}
      <WebhookList method="b_orders" />
    </div>
  );
}
