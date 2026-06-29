import { useEffect, useState } from "react";
import { Card } from "../components/Card.js";
import {
  getMpConfig,
  checkTunnel,
  type MpConfigInfo,
  type MpEnvironment,
} from "../api.js";
import type { TunnelCheckResponse } from "shared";
import { MP_PUBLIC_KEY, mpEnvironment } from "../config.js";
import { useSetting } from "../hooks/useSettings.js";

/** Color-coded badge for a MercadoPago environment. */
function EnvBadge({ environment }: { environment: MpEnvironment }) {
  const cls =
    environment === "production"
      ? "bg-green-100 text-green-700"
      : environment === "test"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`text-xs rounded px-2 py-0.5 font-semibold uppercase ${cls}`}>
      {environment}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-mono text-gray-900 break-all text-right">
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tunnel connectivity self-check component
// ---------------------------------------------------------------------------

function verdictStyle(result: TunnelCheckResponse & { configured: true }): string {
  if (result.isOurJson) return "border-green-300 bg-green-50 text-green-800";
  if (result.looksLikeAuthWall) return "border-red-300 bg-red-50 text-red-800";
  if (result.reachable) return "border-yellow-300 bg-yellow-50 text-yellow-800";
  return "border-red-300 bg-red-50 text-red-800";
}

function TunnelCheck() {
  const [result, setResult] = useState<TunnelCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);

  function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    setBodyOpen(false);
    checkTunnel()
      .then(setResult)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Error al comprobar el túnel"),
      )
      .finally(() => setLoading(false));
  }

  return (
    <Card title="Comprobar túnel">
      <p className="text-sm text-gray-500 mb-3">
        El servidor hace un fetch a su propia URL pública y verifica que
        la respuesta sea nuestro endpoint (no una pantalla de login de GitHub).
      </p>

      <button
        onClick={run}
        disabled={loading}
        className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Probando…" : "Probar conectividad del túnel"}
      </button>

      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}

      {result && !result.configured && (
        <div className="mt-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          {result.verdict}
        </div>
      )}

      {result && result.configured && (
        <div className="mt-3 space-y-3">
          {/* Verdict banner */}
          <div
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${verdictStyle(result)}`}
          >
            {result.verdict}
          </div>

          {/* Details table */}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-sm">
            <div className="flex items-start justify-between gap-4 px-3 py-2">
              <span className="text-xs text-gray-500 shrink-0">URL configurada</span>
              <span className="font-mono text-gray-900 break-all text-right">
                {result.configuredUrl}
              </span>
            </div>
            {result.checkedUrl && (
              <div className="flex items-start justify-between gap-4 px-3 py-2">
                <span className="text-xs text-gray-500 shrink-0">URL comprobada</span>
                <span className="font-mono text-gray-900 break-all text-right">
                  {result.checkedUrl}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-4 px-3 py-2">
              <span className="text-xs text-gray-500">HTTP status</span>
              <span className="font-mono text-gray-900">
                {result.status ?? "—"}
              </span>
            </div>
          </div>

          {/* Body preview — collapsible */}
          {result.bodyPreview && (
            <div>
              <button
                onClick={() => setBodyOpen((v) => !v)}
                className="text-xs text-gray-500 underline underline-offset-2 hover:text-gray-700"
              >
                {bodyOpen ? "Ocultar body preview" : "Ver body preview"}
              </button>
              {bodyOpen && (
                <pre className="mt-2 overflow-x-auto rounded-md bg-gray-100 px-3 py-2 text-xs text-gray-700 whitespace-pre-wrap break-all">
                  {result.bodyPreview}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ConfigEnv() {
  const [backend, setBackend] = useState<MpConfigInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [defaultLimit, setDefaultLimit] = useSetting<number>(
    "pagination.defaultLimit",
  );
  const [sortDir, setSortDir] = useSetting<"asc" | "desc">(
    "display.defaultSortDirection",
  );

  useEffect(() => {
    getMpConfig()
      .then(setBackend)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load API config"),
      )
      .finally(() => setLoading(false));
  }, []);

  const frontEnv = mpEnvironment;
  const backEnv = backend?.accessToken.environment;

  // Both known and different → credentials are crossed (the original bug).
  const mismatch =
    backEnv !== undefined &&
    backEnv !== "unknown" &&
    frontEnv !== backEnv;
  const matched = backEnv !== undefined && backEnv !== "unknown" && !mismatch;

  return (
    <div className="space-y-4">
      <Card title="Preferencias de usuario">
        <div className="space-y-3">
          <div>
            <label
              htmlFor="settings-page-size"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Page size
            </label>
            <select
              id="settings-page-size"
              value={defaultLimit}
              onChange={(e) => setDefaultLimit(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Default de paginación para listas que no especifiquen su propio
              tamaño. Persistido en <span className="font-mono">settings:v1</span>{" "}
              (localStorage).
            </p>
          </div>
          <div>
            <label
              htmlFor="settings-sort-dir"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Default sort direction
            </label>
            <select
              id="settings-sort-dir"
              value={sortDir}
              onChange={(e) =>
                setSortDir(e.target.value as "asc" | "desc")
              }
              className="border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Persistido para uso futuro; el orden actual se resuelve en el
              backend.
            </p>
          </div>
        </div>
      </Card>

      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          Variables de entorno · MercadoPago
        </h2>
        <p className="text-sm text-gray-500">
          Entorno derivado del prefijo de cada credencial:{" "}
          <span className="font-mono">TEST-</span> → test,{" "}
          <span className="font-mono">APP_USR-</span> → producción.
        </p>
      </div>

      {/* Cross-environment warning / OK banner */}
      {mismatch && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>⚠️ Cruce de entornos.</strong> El frontend está en{" "}
          <strong>{frontEnv}</strong> y el backend en <strong>{backEnv}</strong>.
          MercadoPago no permite mezclar credenciales de distinto entorno: el pago
          o la tokenización van a fallar. Ambas deben ser{" "}
          <strong>test</strong> o ambas <strong>producción</strong>, y de la misma
          aplicación.
        </div>
      )}
      {matched && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          <strong>✓ Entornos alineados.</strong> Frontend y backend usan
          credenciales de <strong>{frontEnv}</strong>.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Frontend */}
        <Card title="Frontend (navegador)">
          <Row label="Variable" value="VITE_MP_PUBLIC_KEY" />
          <Row label="Entorno" value={<EnvBadge environment={frontEnv} />} />
          <Row label="Public key" value={MP_PUBLIC_KEY} />
          <p className="mt-2 text-xs text-gray-400">
            La public key es pública por diseño (la usa el Card Brick para
            tokenizar). Se muestra completa.
          </p>
        </Card>

        {/* Backend */}
        <Card title="Backend (API)">
          {loading && <p className="text-sm text-gray-500">Cargando…</p>}
          {error && (
            <p className="text-sm text-red-600">
              No se pudo leer la config del API: {error}
            </p>
          )}
          {backend && (
            <>
              <Row label="Variable" value="MP_ACCESS_TOKEN" />
              <Row
                label="Entorno"
                value={<EnvBadge environment={backend.accessToken.environment} />}
              />
              <Row label="Access token" value={backend.accessToken.masked} />
              <Row
                label="Notification URL"
                value={backend.notificationUrl ?? "—"}
              />
              <Row label="Back URL" value={backend.backUrl ?? "—"} />
              <p className="mt-2 text-xs text-gray-400">
                El access token es secreto: solo se muestran el prefijo y los
                últimos 4 caracteres.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Tunnel connectivity self-check */}
      <TunnelCheck />
    </div>
  );
}
