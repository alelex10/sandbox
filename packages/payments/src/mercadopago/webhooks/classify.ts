export interface WebhookClassification {
  category: string;
  method: string | null;
}

const TOPIC_MAP: Record<string, WebhookClassification> = {
  subscription_preapproval: { category: "subscription", method: null },
  subscription_authorized_payment: { category: "payment", method: "a2_authorized" },
  subscription_preapproval_plan: { category: "plan", method: "a3_plan" },
  payments: { category: "payment", method: null },
  orders: { category: "order", method: "b_orders" },
};

/**
 * Pure function — no I/O, no side effects.
 * Maps a MercadoPago webhook topic string to a category and method identifier.
 */
export function classifyWebhook(topic: string): WebhookClassification {
  return TOPIC_MAP[topic] ?? { category: "unknown", method: null };
}
