"use client";

import { formatearCOP, minimoCobroDeuda } from "@/lib/formatoDinero";

type Props = {
  deudaTotal?: string;
  diasMora?: number;
  cuotasPendientes?: number | null;
  loading?: boolean;
  sinDatos?: boolean;
};

export function DeudaResumenSection({
  deudaTotal,
  diasMora = 0,
  cuotasPendientes = null,
  loading = false,
  sinDatos = false,
}: Props) {
  const cuotasPend =
    cuotasPendientes != null ? Number(cuotasPendientes) : null;
  const minimoRecibir = minimoCobroDeuda(deudaTotal);

  return (
    <section className="px-4 pt-4 pb-3 bg-gradient-to-b from-rose-950/70 via-rose-950/30 to-transparent border-b border-zinc-800/80">
      <p className="text-[11px] font-medium uppercase tracking-wider text-rose-300/90">
        Valor para estar al día
      </p>

      {loading ? (
        <p className="mt-2 text-sm text-zinc-500">Consultando deuda…</p>
      ) : sinDatos || deudaTotal == null ? (
        <p className="mt-2 text-sm text-zinc-500">
          Sin datos de deuda en el reporte
        </p>
      ) : (
        <>
          <p className="mt-1 text-[clamp(1.75rem,8vw,2.25rem)] font-bold text-rose-400 tabular-nums leading-none tracking-tight">
            {formatearCOP(deudaTotal)}
          </p>
          {minimoRecibir != null && (
            <p className="mt-2 text-sm text-amber-300/95 leading-snug">
              <span className="text-[11px] font-medium uppercase tracking-wider text-amber-400/80 block mb-0.5">
                Mínimo a recibir (40%)
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatearCOP(minimoRecibir)}
              </span>
              <span className="text-xs text-amber-400/70"> o más</span>
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {diasMora > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-950/80 border border-amber-800/60 px-2.5 py-1 text-xs font-medium text-amber-200">
                {diasMora} {diasMora === 1 ? "día" : "días"} en mora
              </span>
            )}
            {cuotasPend != null && cuotasPend > 0 && (
              <span className="inline-flex items-center rounded-full bg-zinc-800/90 border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300">
                {cuotasPend % 1 === 0
                  ? cuotasPend.toFixed(0)
                  : cuotasPend.toFixed(1)}{" "}
                cuotas en mora
              </span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
