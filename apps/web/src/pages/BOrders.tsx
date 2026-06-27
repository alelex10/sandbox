import { useState, useEffect, useCallback } from "react";
import { ResponsePanel } from "../components/ResponsePanel.js";
import { WebhookList } from "../components/WebhookList.js";
import { TimelineView } from "../components/TimelineView.js";
import { Card } from "../components/Card.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { AdvancedSection } from "../components/AdvancedSection.js";
import { CardFormMpJs } from "../components/CardFormMpJs.js";
import { CardBrick } from "../components/CardBrick.js";
import {
  createProfile,
  chargeNow,
  listB,
  getBDetail,
  deleteB,
  deleteAllB,
} from "../api.js";
import type {
  BSubscriptionResponse,
  OrderChargeResponse,
  CreateProfileResponse,
} from "../api.js";
import type { SubscriptionDetailResponse, Tokenization } from "shared";

const PUBLIC_KEY = import.meta.env.VITE_MP_PUBLIC_KEY as string;

type TokenizationMode = "mercadopagojs" | "brick";

// ---------------------------------------------------------------------------
// Register payment method section
// ---------------------------------------------------------------------------

function RegisterProfileSection({
  onProfileCreated,
}: {
  onProfileCreated: (newId: string) => void;
}) {
  const [tokenizationMode, setTokenizationMode] = useState<TokenizationMode>("mercadopagojs");
  const [cardTokenId, setCardTokenId] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<Tokenization | null>(null);
  const [paymentMethodId, setPaymentMethodId] = useState("visa");
  const [cardType, setCardType] = useState<"credit_card" | "debit_card">("credit_card");
  const [statementDescriptor, setStatementDescriptor] = useState("");
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
        cardType,
        ...(statementDescriptor ? { statementDescriptor } : {}),
      });
      setResult(created);
      setCardTokenId(null);
      setTokenSource(null);
      onProfileCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Tokenize a card and register it via{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">POST /v1/profiles/payment</code>.
        The returned <code className="text-xs bg-gray-100 px-1 rounded">payment_profile_id</code> is used for charges.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tokenization selector */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Tokenization method</p>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => { setTokenizationMode("mercadopagojs"); setCardTokenId(null); setTokenSource(null); }}
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
              onClick={() => { setTokenizationMode("brick"); setCardTokenId(null); setTokenSource(null); }}
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
              Card token ready (via <span className="font-mono">{tokenSource}</span>). Fill in the payment method and submit.
            </p>
          )}
        </div>

        {/* Payment method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Payment method id</label>
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
          <p className="text-xs text-gray-400 mt-1">Must match the card brand. MP will reject mismatches.</p>
        </div>

        {/* Card type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de tarjeta</label>
          <select
            value={cardType}
            onChange={(e) => setCardType(e.target.value as "credit_card" | "debit_card")}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="credit_card">credit_card</option>
            <option value="debit_card">debit_card</option>
          </select>
        </div>

        {/* Statement descriptor */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Statement descriptor <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={statementDescriptor}
            onChange={(e) => setStatementDescriptor(e.target.value)}
            placeholder="e.g. MY STORE"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Shown on the payer's card statement. Defaults to SANDBOX if empty.</p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !cardTokenId}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Registering…" : cardTokenId ? "Register payment method" : "Tokenize card first"}
        </button>
      </form>

      {result && (
        <div className="mt-4 space-y-3">
          {result.paymentProfileId && (
            <div className="bg-green-50 border border-green-200 rounded px-4 py-3">
              <p className="text-xs font-semibold text-green-700 mb-1 uppercase tracking-wide">Payment profile registered</p>
              <p className="text-xs text-green-800">Profile ID: <span className="font-mono break-all">{result.paymentProfileId}</span></p>
              {result.customerId && (
                <p className="text-xs text-green-800 mt-0.5">Customer ID: <span className="font-mono break-all">{result.customerId}</span></p>
              )}
              <p className="text-xs text-green-800 mt-0.5">Status: <span className="font-mono">{result.status ?? "—"}</span></p>
            </div>
          )}
          <ResponsePanel data={result} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Charge section
// ---------------------------------------------------------------------------

function ChargeSection({
  subscriptions,
  selectedId,
  onCharged,
}: {
  subscriptions: BSubscriptionResponse[];
  selectedId: string | null;
  onCharged: () => void;
}) {
  const [selectedSubId, setSelectedSubId] = useState(selectedId ?? "");
  const [amount, setAmount] = useState("");
  const [sequenceNumber, setSequenceNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chargeResult, setChargeResult] = useState<OrderChargeResponse | null>(null);
  // Advanced charge fields
  const [processingMode, setProcessingMode] = useState<"" | "automatic" | "automatic_async">("");
  const [retries, setRetries] = useState("");
  const [sequenceTotal, setSequenceTotal] = useState("");
  const [subscriptionMpId, setSubscriptionMpId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [invoiceBillingDate, setInvoiceBillingDate] = useState("");
  const [invoicePeriodInterval, setInvoicePeriodInterval] = useState("");
  const [invoicePeriodType, setInvoicePeriodType] = useState("");
  const [firstPayment, setFirstPayment] = useState(false);
  const [previousTransactionReference, setPreviousTransactionReference] = useState("");
  const [description, setDescription] = useState("");

  // Mirror parent selection
  useEffect(() => {
    if (selectedId && selectedId !== selectedSubId) {
      setSelectedSubId(selectedId);
      setChargeResult(null);
      setError(null);
    }
  }, [selectedId, selectedSubId]);

  const chargeableSubs = subscriptions.filter((s) => s.paymentProfileId);
  const selectedSub = subscriptions.find((s) => s.id === selectedSubId);

  async function handleCharge(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedSubId) { setError("Select a subscription first."); return; }
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) { setError("Enter a valid amount greater than 0."); return; }
    setSubmitting(true);
    try {
      const payload: Parameters<typeof chargeNow>[0] = { subscriptionId: selectedSubId, amount: parsedAmount };
      if (sequenceNumber) payload.sequenceNumber = parseInt(sequenceNumber, 10);
      if (processingMode) payload.processingMode = processingMode;
      if (retries) payload.retries = parseInt(retries, 10);
      if (sequenceTotal) payload.sequenceTotal = parseInt(sequenceTotal, 10);
      if (subscriptionMpId) payload.subscriptionMpId = subscriptionMpId;
      if (invoiceId) payload.invoiceId = invoiceId;
      if (invoiceBillingDate) payload.invoiceBillingDate = invoiceBillingDate;
      if (invoicePeriodInterval) payload.invoicePeriodInterval = parseInt(invoicePeriodInterval, 10);
      if (invoicePeriodType) payload.invoicePeriodType = invoicePeriodType;
      if (firstPayment) payload.firstPayment = firstPayment;
      if (previousTransactionReference) payload.previousTransactionReference = previousTransactionReference;
      if (description) payload.description = description;
      const result = await chargeNow(payload);
      setChargeResult(result);
      onCharged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Charge failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (chargeableSubs.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic">
        No subscriptions with a registered payment profile yet — use the Register section first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Select a registered subscription and trigger a charge via{" "}
        <code className="text-xs bg-gray-100 px-1 rounded">POST /v1/orders</code>.
      </p>
      <form onSubmit={handleCharge} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Select subscription</label>
          <select
            value={selectedSubId}
            onChange={(e) => { setSelectedSubId(e.target.value); setChargeResult(null); setError(null); }}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— choose a subscription —</option>
            {chargeableSubs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id.slice(0, 8)}… — profile: {s.paymentProfileId?.slice(0, 12)}… — status: {s.status ?? "?"}
              </option>
            ))}
          </select>
        </div>

        {selectedSub && (
          <div className="bg-gray-50 border border-gray-200 rounded px-4 py-3 text-xs text-gray-700 space-y-0.5">
            <p><span className="font-medium">Profile ID:</span> <span className="font-mono break-all">{selectedSub.paymentProfileId}</span></p>
            <p><span className="font-medium">Customer ID:</span> <span className="font-mono break-all">{selectedSub.customerId ?? "—"}</span></p>
            <p><span className="font-medium">Status:</span> {selectedSub.status ?? "—"}</p>
            <p><span className="font-medium">Tokenization:</span> {selectedSub.tokenization ?? "—"}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sequence number <span className="text-gray-400 font-normal">(optional)</span>
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

        <AdvancedSection>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Processing mode <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              value={processingMode}
              onChange={(e) => setProcessingMode(e.target.value as "" | "automatic" | "automatic_async")}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— default (automatic_async) —</option>
              <option value="automatic">automatic</option>
              <option value="automatic_async">automatic_async</option>
            </select>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Retries <span className="text-gray-400 font-normal">(0–5)</span>
              </label>
              <input
                type="number"
                value={retries}
                onChange={(e) => setRetries(e.target.value)}
                min="0"
                max="5"
                placeholder="default: 3"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sequence total <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                value={sequenceTotal}
                onChange={(e) => setSequenceTotal(e.target.value)}
                min="1"
                placeholder="e.g. 12"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subscription MP ID <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={subscriptionMpId}
              onChange={(e) => setSubscriptionMpId(e.target.value)}
              placeholder="MP subscription id to link this charge"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <fieldset className="border border-gray-100 rounded p-3 space-y-3">
            <legend className="text-xs font-medium text-gray-600 px-1">Invoice (optional)</legend>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Invoice ID</label>
                <input
                  type="text"
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  placeholder="inv-001"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Billing date</label>
                <input
                  type="date"
                  value={invoiceBillingDate}
                  onChange={(e) => setInvoiceBillingDate(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Period interval</label>
                <input
                  type="number"
                  value={invoicePeriodInterval}
                  onChange={(e) => setInvoicePeriodInterval(e.target.value)}
                  min="1"
                  placeholder="e.g. 1"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Period type</label>
                <input
                  type="text"
                  value={invoicePeriodType}
                  onChange={(e) => setInvoicePeriodType(e.target.value)}
                  placeholder="e.g. monthly"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={firstPayment}
              onChange={(e) => setFirstPayment(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>First payment <span className="text-gray-400 font-normal">(stored_credential.first_payment)</span></span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Previous transaction reference <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={previousTransactionReference}
              onChange={(e) => setPreviousTransactionReference(e.target.value)}
              placeholder="stored credential continuity"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly subscription charge"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </AdvancedSection>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting || !selectedSubId || !amount}
          className="w-full bg-emerald-600 text-white rounded px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Charging…" : "Cobrar ahora"}
        </button>
      </form>

      {chargeResult && (
        <div className="mt-4 space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3">
            <p className="text-xs font-semibold text-blue-700 mb-1 uppercase tracking-wide">Charge result</p>
            <p className="text-xs text-blue-800">Order ID: <span className="font-mono break-all">{chargeResult.mpOrderId ?? "—"}</span></p>
            <p className="text-xs text-blue-800 mt-0.5">Status: <span className="font-mono">{chargeResult.status ?? "—"}</span></p>
          </div>
          <ResponsePanel data={chargeResult} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOrders page
// ---------------------------------------------------------------------------

export function BOrders() {
  const [subscriptions, setSubscriptions] = useState<BSubscriptionResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubscriptionDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const rows = await listB();
      setSubscriptions(rows);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void fetchSubscriptions();
  }, [fetchSubscriptions]);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const d = await getBDetail(id);
      setDetail(d);
    } catch {
      // non-critical
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar este registro del historial? (borrado lógico, los datos se conservan)")) return;
    try {
      await deleteB(id);
      await fetchSubscriptions();
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  function selectSubscription(id: string) {
    // H2: removed early-return so re-clicking always refetches the detail
    setSelectedId(id);
    setDetail(null);
    void fetchDetail(id);
  }

  // L2: after profile creation, refresh list and auto-select the new subscription
  function handleProfileCreated(newId: string) {
    void fetchSubscriptions();
    setSelectedId(newId);
    setDetail(null);
    void fetchDetail(newId);
  }

  function handleCharged() {
    void fetchSubscriptions();
    if (selectedId) void fetchDetail(selectedId);
  }

  const selectedSub = subscriptions.find((s) => s.id === selectedId);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">B — Orders / Automatic Payments</h2>
        <p className="text-sm text-gray-500">
          Register a card once (<code className="text-xs bg-gray-100 px-1 rounded">POST /v1/profiles/payment</code>),
          then trigger charges on demand (<code className="text-xs bg-gray-100 px-1 rounded">POST /v1/orders</code>).
          MP does not manage the schedule — you control each charge.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-6">
        {/* ── Left sidebar ── */}
        <aside className="space-y-2">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Suscripciones</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{subscriptions.length}</span>
                {subscriptions.length > 0 && (
                  <button
                    type="button"
                    disabled={deletingAll}
                    onClick={async () => {
                      if (!window.confirm("¿Eliminar TODO el historial de esta sección? (borrado lógico, los datos se conservan)")) return;
                      setDeletingAll(true);
                      try {
                        await deleteAllB();
                        await fetchSubscriptions();
                        setSelectedId(null);
                        setDetail(null);
                      } catch (err) {
                        window.alert(err instanceof Error ? err.message : "No se pudo eliminar");
                      } finally {
                        setDeletingAll(false);
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Eliminar todo
                  </button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {subscriptions.length === 0 && (
                <li className="px-4 py-3 text-xs text-gray-400 italic">None yet.</li>
              )}
              {subscriptions.map((sub) => (
                <li key={sub.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => selectSubscription(sub.id)}
                    className={[
                      "w-full text-left px-4 py-3 text-xs hover:bg-gray-50 transition-colors pr-8",
                      selectedId === sub.id ? "bg-blue-50 border-l-2 border-blue-500" : "",
                    ].join(" ")}
                  >
                    <div className="font-mono text-gray-700 truncate">{sub.id.slice(0, 16)}…</div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={sub.status} />
                      <span className="text-gray-400">{sub.charges.length} charges</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => void handleDelete(sub.id, e)}
                    title="Eliminar del historial (borrado lógico)"
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* ── Right main column ── */}
        <div className="space-y-4 min-w-0">
          {/* Register profile card */}
          <Card title="Sección 1 — Registrar medio de pago">
            <RegisterProfileSection onProfileCreated={handleProfileCreated} />
          </Card>

          {/* Charge card */}
          <Card title="Sección 2 — Cobrar ahora">
            <ChargeSection
              subscriptions={subscriptions}
              selectedId={selectedId}
              onCharged={handleCharged}
            />
          </Card>

          {/* Medios de pago table */}
          {subscriptions.length > 0 && (
            <Card title="Medios de pago registrados">
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs text-gray-700">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Profile ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Customer ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Tokenization</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Charges</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Created at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {subscriptions.map((s) => (
                      <tr
                        key={s.id}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedId === s.id ? "bg-blue-50" : ""}`}
                        onClick={() => selectSubscription(s.id)}
                      >
                        <td className="px-3 py-2 font-mono break-all">{s.id}</td>
                        <td className="px-3 py-2">{s.status ?? "—"}</td>
                        <td className="px-3 py-2 font-mono break-all">{s.paymentProfileId ?? "—"}</td>
                        <td className="px-3 py-2 font-mono break-all">{s.customerId ?? "—"}</td>
                        <td className="px-3 py-2">{s.tokenization ?? "—"}</td>
                        <td className="px-3 py-2">{s.charges.length}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{s.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Timeline card */}
          <Card title="Timeline">
            {selectedSub ? (
              <div>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                  <span className="text-xs text-gray-500 font-mono">{selectedSub.id}</span>
                  <StatusBadge status={selectedSub.status} />
                  <span className="text-xs text-gray-400">{selectedSub.charges.length} charges</span>
                  <button
                    type="button"
                    onClick={() => { if (selectedId) void fetchDetail(selectedId); }}
                    disabled={detailLoading}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    title="Refetch timeline"
                  >
                    {detailLoading ? "..." : "↻ Actualizar"}
                  </button>
                </div>
                <TimelineView
                  entries={detail?.timeline ?? []}
                  loading={detailLoading}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                Select a subscription from the sidebar to see its timeline.
              </p>
            )}
          </Card>

          {/* Webhooks card */}
          <Card title="Webhook Events (live feed)">
            <p className="text-xs text-gray-500 mb-3">
              Method-level feed including unattributed events.
              <span className="text-gray-400"> (polling every 5s)</span>
            </p>
            <WebhookList method="b_orders" />
          </Card>
        </div>
      </div>
    </div>
  );
}
