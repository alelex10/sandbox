import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { A1Pending } from "./pages/A1Pending.js";
import { A2Authorized } from "./pages/A2Authorized.js";
import { A3Plan } from "./pages/A3Plan.js";
import { BOrders } from "./pages/BOrders.js";
import { ConfigEnv } from "./pages/ConfigEnv.js";
import { ErrorsView } from "./pages/ErrorsView.js";
import { NotificationsInbox } from "./pages/NotificationsInbox.js";
import { NotesView } from "./components/NotesView.js";

type Tab = {
  label: string;
  to: string;
};

// Tab order mirrors the design's route table. The /notes route carries the
// method in the URL (e.g. /notes?method=a1_pending) — NotesView reads it
// from the search params (PR4 deviation #1 closed in PR5).
const TABS: Tab[] = [
  { label: "A.1 Preapproval Pending", to: "/a1" },
  { label: "A.2 Preapproval Authorized", to: "/a2" },
  { label: "A.3 Preapproval Plan", to: "/a3/subs" },
  { label: "B Orders", to: "/b" },
  { label: "📝 Notes", to: "/notes?method=a1_pending" },
  { label: "🐞 Errors", to: "/errors" },
  { label: "🔔 Notificaciones", to: "/notifications" },
  { label: "⚙︎ Config / Env", to: "/config" },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
    isActive
      ? "border-blue-600 text-blue-600"
      : "border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300",
  ].join(" ");
}

export function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">MercadoPago Subscriptions Sandbox</h1>
      </header>

      {/* Tab bar */}
      <nav className="bg-white border-b border-gray-200 px-4 lg:px-8">
        <ul className="flex gap-1" role="tablist">
          {TABS.map((tab) => (
            <li key={tab.to} role="presentation">
              <NavLink to={tab.to} className={navLinkClass} end>
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Page panel */}
      <main className="max-w-7xl mx-auto px-4 lg:px-8 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/a1" replace />} />
          <Route path="/a1" element={<A1Pending />} />
          <Route path="/a1/:id" element={<A1Pending />} />
          <Route path="/a2" element={<A2Authorized />} />
          <Route path="/a2/:id" element={<A2Authorized />} />
          <Route path="/a3" element={<Navigate to="/a3/subs" replace />} />
          <Route path="/a3/plans" element={<A3Plan section="plans" />} />
          <Route path="/a3/plans/:planId" element={<A3Plan section="plans" />} />
          <Route path="/a3/subs" element={<A3Plan section="subs" />} />
          <Route path="/a3/subs/:subId" element={<A3Plan section="subs" />} />
          <Route path="/b" element={<BOrders />} />
          <Route path="/b/:id" element={<BOrders />} />
          <Route path="/notes" element={<NotesView />} />
          <Route path="/errors" element={<ErrorsView />} />
          <Route path="/notifications" element={<NotificationsInbox />} />
          <Route path="/config" element={<ConfigEnv />} />
          <Route path="*" element={<Navigate to="/a1" replace />} />
        </Routes>
      </main>
    </div>
  );
}
