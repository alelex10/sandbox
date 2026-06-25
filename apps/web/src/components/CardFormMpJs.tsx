import { useState, useRef } from "react";
import { loadMercadoPago } from "@mercadopago/sdk-js";

interface Props {
  publicKey: string;
  onToken: (cardTokenId: string) => void;
}

interface MpInstance {
  createCardToken: (data: Record<string, string>) => Promise<{ id: string }>;
}

declare global {
  interface Window {
    MercadoPago: new (publicKey: string, options?: { locale?: string }) => MpInstance;
  }
}

let sdkLoaded = false;

async function ensureSdkLoaded(): Promise<void> {
  if (sdkLoaded) return;
  await loadMercadoPago();
  sdkLoaded = true;
}

interface FormState {
  cardNumber: string;
  cardholderName: string;
  cardExpirationMonth: string;
  cardExpirationYear: string;
  securityCode: string;
  identificationType: string;
  identificationNumber: string;
}

/**
 * Custom card form using MercadoPago.js v2 (CDN) createCardToken.
 * Loads the SDK once, collects raw card fields, and calls onToken with the
 * resulting card token id. No card data is sent to our backend.
 */
export function CardFormMpJs({ publicKey, onToken }: Props) {
  const [form, setForm] = useState<FormState>({
    cardNumber: "",
    cardholderName: "",
    cardExpirationMonth: "",
    cardExpirationYear: "",
    securityCode: "",
    identificationType: "DNI",
    identificationNumber: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mpRef = useRef<MpInstance | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await ensureSdkLoaded();

      if (!mpRef.current) {
        mpRef.current = new window.MercadoPago(publicKey, { locale: "es-AR" });
      }

      const tokenResult = await mpRef.current.createCardToken({
        cardNumber: form.cardNumber.replace(/\s/g, ""),
        cardholderName: form.cardholderName,
        cardExpirationMonth: form.cardExpirationMonth,
        cardExpirationYear: form.cardExpirationYear,
        securityCode: form.securityCode,
        identificationType: form.identificationType,
        identificationNumber: form.identificationNumber,
      });

      if (!tokenResult?.id) {
        throw new Error("Token creation returned no id");
      }

      onToken(tokenResult.id);

      // Reset sensitive fields immediately after use
      setForm((prev) => ({
        ...prev,
        cardNumber: "",
        securityCode: "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tokenization failed");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Card number
        </label>
        <input
          type="text"
          name="cardNumber"
          value={form.cardNumber}
          onChange={handleChange}
          required
          placeholder="4111 1111 1111 1111"
          maxLength={19}
          autoComplete="cc-number"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Cardholder name
        </label>
        <input
          type="text"
          name="cardholderName"
          value={form.cardholderName}
          onChange={handleChange}
          required
          placeholder="JOHN DOE"
          autoComplete="cc-name"
          className={inputClass}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Expiry month (MM)
          </label>
          <input
            type="text"
            name="cardExpirationMonth"
            value={form.cardExpirationMonth}
            onChange={handleChange}
            required
            placeholder="12"
            maxLength={2}
            pattern="\d{1,2}"
            autoComplete="cc-exp-month"
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Expiry year (YY)
          </label>
          <input
            type="text"
            name="cardExpirationYear"
            value={form.cardExpirationYear}
            onChange={handleChange}
            required
            placeholder="28"
            maxLength={2}
            pattern="\d{2}"
            autoComplete="cc-exp-year"
            className={inputClass}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            CVV
          </label>
          <input
            type="text"
            name="securityCode"
            value={form.securityCode}
            onChange={handleChange}
            required
            placeholder="123"
            maxLength={4}
            pattern="\d{3,4}"
            autoComplete="cc-csc"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-28">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Doc type
          </label>
          <select
            name="identificationType"
            value={form.identificationType}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="DNI">DNI</option>
            <option value="CI">CI</option>
            <option value="LC">LC</option>
            <option value="LE">LE</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Doc number
          </label>
          <input
            type="text"
            name="identificationNumber"
            value={form.identificationNumber}
            onChange={handleChange}
            required
            placeholder="12345678"
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Tokenizing…" : "Tokenize card (MP.js v2)"}
      </button>
    </form>
  );
}
