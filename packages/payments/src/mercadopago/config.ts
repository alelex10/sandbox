/** Shared configuration for every Mercado Pago implementation. */
export interface MercadoPagoConfig {
  /** Access token from your Mercado Pago application credentials. */
  accessToken: string;
  /** URL Mercado Pago should call back on payment status changes. */
  notificationUrl?: string;
  /** Where to send the payer after success/failure/pending. */
  backUrls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
}
