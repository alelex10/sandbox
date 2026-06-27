import { useEffect, useState } from "react";
import { Card } from "../components/Card.js";
import { getMpConfig, type MpConfigInfo, type MpEnvironment } from "../api.js";
import { MP_PUBLIC_KEY, mpEnvironment } from "../config.js";

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

export function ConfigEnv() {
  const [backend, setBackend] = useState<MpConfigInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    </div>
  );
}
