import { useState, useRef } from "react";

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
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
      if (typeof window.MercadoPago !== "function") {
        throw new Error(
          "MercadoPago SDK v2 is not loaded. Make sure the <script src=\"https://sdk.mercadopago.com/js/v2\"></script> tag is present in index.html.",
        );
      }

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
      setLastToken(tokenResult.id);
      setCopied(false);

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

      {lastToken && (
        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-gray-600">
              Card token id (para debug / pruebas API)
            </label>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(lastToken);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // fallback: select the text
                  const el = document.getElementById("last-token-input");
                  if (el) (el as HTMLInputElement).select();
                }
              }}
              className="text-xs px-2 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100 transition-colors"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <input
            id="last-token-input"
            type="text"
            readOnly
            value={lastToken}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="w-full font-mono text-xs bg-white border border-gray-300 rounded px-2 py-1.5 text-gray-800"
          />
          <p className="text-[10px] text-gray-500">
            Expira en 7 días. Usar solo con tu propio access token en pruebas API.
          </p>
        </div>
      )}
    </form>
  );
}
