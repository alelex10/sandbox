import { useState } from "react";
import type { SubscriptionMethod } from "shared";

const TABS: { label: string; value: SubscriptionMethod }[] = [
  { label: "A.1 Preapproval Pending", value: "a1_pending" },
  { label: "A.2 Preapproval Authorized", value: "a2_authorized" },
  { label: "A.3 Preapproval Plan", value: "a3_plan" },
  { label: "B Orders", value: "b_orders" },
];

function PlaceholderPage({ method }: { method: SubscriptionMethod }) {
  return (
    <div className="p-8">
      <h2 className="text-xl font-semibold mb-2">{method}</h2>
      <p className="text-gray-500">Implementation coming in the next PR slice.</p>
    </div>
  );
}

export function App() {
  const [activeMethod, setActiveMethod] = useState<SubscriptionMethod>("a1_pending");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">MercadoPago Subscriptions Sandbox</h1>
      </header>

      {/* Tab bar */}
      <nav className="bg-white border-b border-gray-200 px-6">
        <ul className="flex gap-1" role="tablist">
          {TABS.map((tab) => (
            <li key={tab.value} role="presentation">
              <button
                role="tab"
                aria-selected={activeMethod === tab.value}
                onClick={() => setActiveMethod(tab.value)}
                className={[
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  activeMethod === tab.value
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300",
                ].join(" ")}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Page panel */}
      <main>
        <PlaceholderPage method={activeMethod} />
      </main>
    </div>
  );
}
