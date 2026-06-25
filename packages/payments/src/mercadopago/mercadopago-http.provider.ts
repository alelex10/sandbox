import type {
  PaymentProvider,
  PaymentRequest,
  PaymentResult,
} from "../payment-provider.js";
import type { MercadoPagoConfig } from "./config.js";

/**
 * Mercado Pago implementation backed by raw HTTP calls to the REST API
 * (no SDK, just `fetch`).
 *
 * Skeleton only — fill in the bodies when you implement this variant. Useful to
 * compare bundle size, control, and behaviour against
 * {@link MercadoPagoSdkProvider} under the same {@link PaymentProvider}
 * contract.
 */
export class MercadoPagoHttpProvider implements PaymentProvider {
  readonly name = "mercadopago-http";

  private readonly baseUrl = "https://api.mercadopago.com";

  constructor(private readonly config: MercadoPagoConfig) {}

  async createPayment(_request: PaymentRequest): Promise<PaymentResult> {
    // TODO: POST /checkout/preferences with the access token and map the response.
    throw new Error("MercadoPagoHttpProvider.createPayment not implemented");
  }

  async getPayment(_id: string): Promise<PaymentResult> {
    // TODO: GET /v1/payments/:id and map it to PaymentResult.
    throw new Error("MercadoPagoHttpProvider.getPayment not implemented");
  }
}
