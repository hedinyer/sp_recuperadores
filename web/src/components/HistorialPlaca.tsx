"use client";

import type { ItemHistorialPlaca } from "@/lib/historialPlaca";
import { formatFechaHora } from "@/lib/fechas";

function formatearCOP(val: number | undefined): string {
  if (val == null || val <= 0) return "";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(val);
}

export function HistorialPlaca({
  items,
  loading,
  error,
}: {
  items: ItemHistorialPlaca[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden"
      aria-label="Historial de cobros y recogidas"
    >
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
        <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
          Historial
        </h2>
        <p className="mt-0.5 text-xs text-zinc-400">
          Cobros y recogidas de esta placa
        </p>
      </div>

      <div className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain">
        {loading ? (
          <p className="px-4 py-6 text-sm text-zinc-500 text-center">
            Cargando historial…
          </p>
        ) : error ? (
          <p className="px-4 py-6 text-sm text-red-300 text-center">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500 text-center">
            Sin movimientos registrados
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/80">
            {items.map((item) => (
              <li
                key={item.id}
                className="px-4 py-3 flex gap-3 items-start"
              >
                <span
                  className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${
                    item.categoria === "recogida"
                      ? "bg-blue-400"
                      : "bg-emerald-400"
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-100 leading-snug">
                      {item.titulo}
                    </p>
                    {item.monto != null && item.monto > 0 ? (
                      <p className="text-sm font-semibold text-emerald-400 tabular-nums shrink-0">
                        {formatearCOP(item.monto)}
                      </p>
                    ) : null}
                  </div>
                  {item.subtitulo ? (
                    <p className="mt-0.5 text-xs text-zinc-500 leading-snug">
                      {item.subtitulo}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-zinc-600 tabular-nums">
                    {formatFechaHora(item.fecha)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
