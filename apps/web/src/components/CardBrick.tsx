import { useState } from "react";
import { CardFormMpJs } from "./CardFormMpJs.js";

interface Props {
  publicKey: string;
  onToken: (cardTokenId: string) => void;
}

/**
 * Card Payment Brick tokenization component.
 *
 * Historically this component mounted the hosted @mercadopago/sdk-react
 * `CardPayment` Brick, which under the hood used the deprecated
 * `/v1/card_token` (singular) endpoint and now 404s. The deprecated SDKs
 * are no longer updated.
 *
 * The current strategy is to keep the same `publicKey` / `onToken` contract
 * and wrap the robust `CardFormMpJs` (MercadoPago.js v2, CDN) inside a more
 * presentable Card shell — header, description, footer. The tokenized
 * `card_token_id` is passed back through `onToken` exactly as before.
 */
export function CardBrick({ publicKey, onToken }: Props) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  function handleToken(tokenId: string) {
    setSubmitError(null);
    onToken(tokenId);
  }

  return (
    <Card>
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Tarjeta de crédito o débito
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Ingresá los datos de tu tarjeta. MercadoPago tokeniza la tarjeta en
            el navegador; los datos sensibles nunca llegan a nuestro backend.
          </p>
        </div>

        <CardFormMpJs publicKey={publicKey} onToken={handleToken} />

        {submitError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {submitError}
          </p>
        )}

        <p className="text-[10px] text-gray-500">
          Powered by MercadoPago.js v2 · CardPayment Brick (visual wrapper)
        </p>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="p-4">{children}</div>
    </div>
  );
}
