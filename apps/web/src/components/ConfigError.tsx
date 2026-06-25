interface ConfigErrorProps {
  error: Error & { isConfigError?: boolean; details?: string[] };
}

export function ConfigErrorDisplay({ error }: ConfigErrorProps) {
  if (!error.isConfigError) {
    return null;
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
      <h3 className="text-red-800 font-semibold mb-2">⚠️ Error de Configuración del Servidor</h3>
      <p className="text-red-700 mb-2">{error.message}</p>
      {error.details && error.details.length > 0 && (
        <div className="bg-red-100 rounded p-2">
          <p className="text-red-800 text-sm font-medium mb-1">Detalles:</p>
          <ul className="text-red-700 text-sm list-disc list-inside">
            {error.details.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-red-600 text-sm mt-2">
        Contacta al administrador del servidor para resolver este problema.
      </p>
    </div>
  );
}
