import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
} from "../payment-provider.js";
import type { MercadoPagoConfig } from "./config.js";

/**
 * Mercado Pago implementation backed by the official `mercadopago` SDK.
 *
 * Skeleton only — fill in the bodies and add the `mercadopago` dependency when
 * you implement this variant. Kept as a separate class so you can A/B it
 * against {@link MercadoPagoHttpProvider} under the same {@link PaymentProvider}
 * contract.
 */
export class MercadoPagoSdkProvider implements PaymentProvider {
  readonly name = "mercadopago-sdk";

  constructor(private readonly config: MercadoPagoConfig) {}

  async createPayment(_request: PaymentRequest): Promise<PaymentResult> {
    // TODO: use the official SDK (Preference/Payment) to create the payment.
    throw new Error("MercadoPagoSdkProvider.createPayment not implemented");
  }

  async getPayment(_id: string): Promise<PaymentResult> {
    // TODO: fetch the payment via the SDK and map it to PaymentResult.
    throw new Error("MercadoPagoSdkProvider.getPayment not implemented");
  }
}
