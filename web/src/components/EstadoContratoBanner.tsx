/** Banner enorme RETENIDO / INACTIVO / VITRINA en ficha de placa. */
export function EstadoContratoBanner({
  etiqueta,
  motivo,
  fechaCorte,
  deudaAlCorte,
}: {
  etiqueta?: string | null;
  motivo?: string | null;
  fechaCorte?: string | null;
  /** Si true, la deuda mostrada es al corte (no sigue el día a día). */
  deudaAlCorte?: boolean;
}) {
  const label = String(etiqueta ?? "").trim().toUpperCase();
  if (!label) return null;

  const esRetenido = label.includes("RETEN");
  const tono = esRetenido
    ? "border-orange-500 bg-orange-600 text-white"
    : label.includes("INACTIV")
      ? "border-zinc-500 bg-zinc-700 text-white"
      : "border-amber-500 bg-amber-600 text-white";

  return (
    <div
      role="status"
      className={`px-4 py-4 border-b ${tono} text-center`}
    >
      <p className="text-[clamp(1.75rem,9vw,2.75rem)] font-black tracking-[0.12em] leading-none uppercase">
        {label}
      </p>
      {motivo ? (
        <p className="mt-2 text-sm font-medium opacity-95">{motivo}</p>
      ) : null}
      {fechaCorte ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider opacity-90">
          Corte {fechaCorte}
          {deudaAlCorte ? " · deuda congelada" : ""}
        </p>
      ) : deudaAlCorte ? (
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider opacity-90">
          Deuda al estado actual (sin fecha de corte en ERP)
        </p>
      ) : null}
    </div>
  );
}
