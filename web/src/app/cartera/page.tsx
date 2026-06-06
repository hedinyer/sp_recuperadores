"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { NavFooter } from "@/components/NavFooter";
import type { CarteraMetricas } from "@/lib/carteraMetricas";
import type { RiesgoMora, TendenciaDeuda } from "@/lib/analisisMorosidad";
import { formatearCOP } from "@/lib/formatoDinero";

const POLL_MS = 90_000;

const RIESGO_CONFIG: Record<
  RiesgoMora,
  { label: string; color: string; bg: string }
> = {
  critico: { label: "Crítico", color: "text-red-300", bg: "bg-red-500" },
  alto: { label: "Alto", color: "text-orange-300", bg: "bg-orange-500" },
  medio: { label: "Medio", color: "text-amber-300", bg: "bg-amber-500" },
  bajo: { label: "Bajo", color: "text-zinc-400", bg: "bg-zinc-500" },
};

const TENDENCIA_CONFIG: Record<
  TendenciaDeuda,
  { label: string; color: string; bg: string }
> = {
  creciente: { label: "Creciente", color: "text-red-300", bg: "bg-red-500" },
  estable: { label: "Estable", color: "text-zinc-300", bg: "bg-zinc-500" },
  mejorando: { label: "Mejorando", color: "text-emerald-300", bg: "bg-emerald-500" },
};

function formatearCompacto(val: number): string {
  if (val >= 1_000_000_000) {
    return `$${(val / 1_000_000_000).toFixed(1)}B`;
  }
  if (val >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `$${Math.round(val / 1_000)}k`;
  }
  return formatearCOP(val);
}

function tiempoRelativo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const seg = Math.floor(diff / 1000);
  if (seg < 10) return "ahora";
  if (seg < 60) return `hace ${seg}s`;
  const min = Math.floor(seg / 60);
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

function BarraDistribucion({
  etiqueta,
  cantidad,
  deuda,
  maxDeuda,
  color = "bg-blue-500",
}: {
  etiqueta: string;
  cantidad: number;
  deuda: number;
  maxDeuda: number;
  color?: string;
}) {
  const pct = maxDeuda > 0 ? Math.max(4, (deuda / maxDeuda) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-zinc-300 truncate">{etiqueta}</span>
        <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">
          {cantidad} · {formatearCompacto(deuda)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent = "text-zinc-100",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-center">
      <p className="text-[9px] font-medium uppercase tracking-wider text-zinc-500 leading-tight">
        {label}
      </p>
      <p className={`text-sm font-bold tabular-nums mt-0.5 ${accent}`}>{value}</p>
      {sub && (
        <p className="text-[9px] text-zinc-500 mt-0.5 leading-tight">{sub}</p>
      )}
    </div>
  );
}

export default function CarteraPage() {
  const [metricas, setMetricas] = useState<CarteraMetricas | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<string | null>(
    null,
  );
  const [, setTick] = useState(0);

  const cargar = useCallback(async (force = false) => {
    const url = force ? "/api/cartera?refresh=1" : "/api/cartera";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Error al cargar cartera");
    }
    const data = await res.json();
    setMetricas(data.metricas);
    setUltimaActualizacion(data.metricas?.generado_en ?? new Date().toISOString());
    setError(null);
  }, []);

  const refrescar = useCallback(async () => {
    setRefreshing(true);
    try {
      await cargar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setRefreshing(false);
    }
  }, [cargar]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    cargar()
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => {
      cargar(true).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [cargar]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const maxDeudaMora = useMemo(
    () =>
      metricas
        ? Math.max(...metricas.distribucion_mora.map((b) => b.deuda), 1)
        : 1,
    [metricas],
  );

  const maxDeudaBucket = useMemo(
    () =>
      metricas
        ? Math.max(...metricas.distribucion_deuda.map((b) => b.deuda), 1)
        : 1,
    [metricas],
  );

  const maxDeudaVisitador = useMemo(
    () =>
      metricas
        ? Math.max(...metricas.por_visitador.map((v) => v.deuda), 1)
        : 1,
    [metricas],
  );

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <header className="shrink-0 px-4 pb-3 border-b border-zinc-800/80">
        <div className="w-full max-w-[414px] mx-auto flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white">
              Cartera
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              BI en tiempo real · deuda total empresa
            </p>
          </div>
          <button
            type="button"
            onClick={refrescar}
            disabled={refreshing || loading}
            aria-label="Actualizar datos"
            className="shrink-0 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-300 text-lg disabled:opacity-40 active:scale-95 transition-transform touch-manipulation"
          >
            {refreshing ? "…" : "↻"}
          </button>
        </div>
        {ultimaActualizacion && !loading && (
          <p className="w-full max-w-[414px] mx-auto text-[10px] text-zinc-600 mt-1.5">
            Actualizado {tiempoRelativo(ultimaActualizacion)} · auto cada 90s
          </p>
        )}
      </header>

      <main className="flex-1 w-full max-w-[414px] mx-auto px-3 sm:px-4 py-3 pb-4 flex flex-col gap-3 overflow-y-auto">
        <AdminGate
          title="Cartera empresarial"
          subtitle="Acceso solo administradores"
        >
          {loading && !metricas ? (
            <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-12 text-center">
              <p className="text-sm text-zinc-500">Calculando cartera…</p>
            </div>
          ) : error && !metricas ? (
            <div className="rounded-2xl border border-red-900/50 bg-red-950/20 px-4 py-8 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <button
                type="button"
                onClick={refrescar}
                className="mt-3 text-xs text-red-400 underline"
              >
                Reintentar
              </button>
            </div>
          ) : metricas ? (
            <>
              {/* Hero: total cartera */}
              <section className="rounded-2xl border border-blue-900/40 bg-gradient-to-br from-blue-950/50 to-zinc-900/80 px-4 py-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-blue-400/80">
                  Deuda total en cartera
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums mt-1 tracking-tight">
                  {formatearCOP(metricas.cartera.deuda_total)}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-zinc-400">
                  <span>
                    <strong className="text-zinc-200 font-semibold">
                      {metricas.cartera.total_clientes}
                    </strong>{" "}
                    clientes
                  </span>
                  <span>·</span>
                  <span>
                    Prom.{" "}
                    <strong className="text-zinc-200 font-semibold">
                      {formatearCompacto(metricas.cartera.deuda_promedio)}
                    </strong>
                  </span>
                  <span>·</span>
                  <span>
                    Cumpl.{" "}
                    <strong className="text-zinc-200 font-semibold">
                      {metricas.cartera.cumplimiento_promedio}%
                    </strong>
                  </span>
                </div>
              </section>

              {/* KPIs operativos */}
              <section className="grid grid-cols-3 gap-1.5">
                <KpiCard
                  label="Sin pago hoy"
                  value={String(metricas.cartera.sin_pago_hoy)}
                  sub={`${metricas.cartera.pct_sin_pago_hoy}%`}
                  accent="text-amber-300"
                />
                <KpiCard
                  label="Con pago hoy"
                  value={String(metricas.cartera.con_pago_hoy)}
                  accent="text-emerald-300"
                />
                <KpiCard
                  label="GPS activo"
                  value={String(metricas.cartera.con_gps_funcional)}
                  sub="recuperables"
                  accent="text-blue-300"
                />
              </section>

              {/* Morosos — prioridad recuperación */}
              <section className="rounded-2xl border border-amber-900/30 bg-zinc-900/60 px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h2 className="text-[10px] font-medium uppercase tracking-wider text-amber-500/90">
                    Morosos — prioridad cobro
                  </h2>
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    {metricas.morosos.pct_de_cartera}% de cartera
                  </span>
                </div>
                <p className="text-xl font-bold text-amber-200 tabular-nums">
                  {formatearCOP(metricas.morosos.deuda_total)}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {metricas.morosos.total} casos · mín. recuperable{" "}
                  <span className="text-emerald-400 font-medium">
                    {formatearCompacto(metricas.morosos.recuperable_minimo)}
                  </span>
                </p>
                <div className="grid grid-cols-4 gap-1 mt-2.5">
                  <KpiCard
                    label="Críticos"
                    value={String(metricas.morosos.criticos)}
                    accent="text-red-300"
                  />
                  <KpiCard
                    label="Sin pago"
                    value={String(metricas.morosos.sin_pago_hoy)}
                    accent="text-amber-300"
                  />
                  <KpiCard
                    label="GPS ok"
                    value={String(metricas.morosos.con_gps_funcional)}
                    accent="text-blue-300"
                  />
                  <KpiCard
                    label="Diario s/abono"
                    value={String(metricas.morosos.pago_diario_sin_abono)}
                    accent="text-orange-300"
                  />
                </div>
              </section>

              {/* Riesgo */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
                  Morosos por riesgo
                </h2>
                <div className="flex flex-col gap-2">
                  {(["critico", "alto", "medio", "bajo"] as RiesgoMora[]).map(
                    (r) => {
                      const d = metricas.morosos.por_riesgo[r];
                      const cfg = RIESGO_CONFIG[r];
                      const maxR = Math.max(
                        ...(["critico", "alto", "medio", "bajo"] as RiesgoMora[]).map(
                          (k) => metricas.morosos.por_riesgo[k].deuda,
                        ),
                        1,
                      );
                      return (
                        <BarraDistribucion
                          key={r}
                          etiqueta={`${cfg.label} (${d.cantidad})`}
                          cantidad={d.cantidad}
                          deuda={d.deuda}
                          maxDeuda={maxR}
                          color={cfg.bg}
                        />
                      );
                    },
                  )}
                </div>
              </section>

              {/* Tendencia deuda */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
                  Tendencia de deuda (morosos)
                </h2>
                <div className="flex flex-col gap-2">
                  {(["creciente", "estable", "mejorando"] as TendenciaDeuda[]).map(
                    (t) => {
                      const d = metricas.morosos.por_tendencia[t];
                      const cfg = TENDENCIA_CONFIG[t];
                      const maxT = Math.max(
                        ...(["creciente", "estable", "mejorando"] as TendenciaDeuda[]).map(
                          (k) => metricas.morosos.por_tendencia[k].deuda,
                        ),
                        1,
                      );
                      return (
                        <BarraDistribucion
                          key={t}
                          etiqueta={`${cfg.label} (${d.cantidad})`}
                          cantidad={d.cantidad}
                          deuda={d.deuda}
                          maxDeuda={maxT}
                          color={cfg.bg}
                        />
                      );
                    },
                  )}
                </div>
              </section>

              {/* Distribución mora */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
                  Cartera por días de mora
                </h2>
                <div className="flex flex-col gap-2">
                  {metricas.distribucion_mora.map((b) => (
                    <BarraDistribucion
                      key={b.etiqueta}
                      etiqueta={b.etiqueta}
                      cantidad={b.cantidad}
                      deuda={b.deuda}
                      maxDeuda={maxDeudaMora}
                      color="bg-violet-500"
                    />
                  ))}
                </div>
              </section>

              {/* Distribución monto */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
                  Cartera por monto de deuda
                </h2>
                <div className="flex flex-col gap-2">
                  {metricas.distribucion_deuda.map((b) => (
                    <BarraDistribucion
                      key={b.etiqueta}
                      etiqueta={b.etiqueta}
                      cantidad={b.cantidad}
                      deuda={b.deuda}
                      maxDeuda={maxDeudaBucket}
                      color="bg-cyan-500"
                    />
                  ))}
                </div>
              </section>

              {/* Top deudores */}
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2">
                  Top 5 mayores deudores
                </h2>
                <div className="flex flex-col gap-2">
                  {metricas.top_deudores.map((d, i) => (
                    <div
                      key={d.placa}
                      className="flex items-center gap-2.5 py-1.5 border-b border-zinc-800/60 last:border-0"
                    >
                      <span className="text-[11px] font-bold text-zinc-600 w-4 tabular-nums">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-zinc-100 truncate">
                          {d.placa}
                        </p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {d.nombre || "—"} · {d.dias_mora}d mora
                        </p>
                      </div>
                      <span className="text-xs font-bold text-red-300 tabular-nums shrink-0">
                        {formatearCompacto(d.deuda_total)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Por visitador */}
              {metricas.por_visitador.length > 0 && (
                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                  <h2 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-2.5">
                    Deuda por visitador
                  </h2>
                  <div className="flex flex-col gap-2">
                    {metricas.por_visitador.map((v) => (
                      <BarraDistribucion
                        key={v.visitador}
                        etiqueta={v.visitador}
                        cantidad={v.cantidad}
                        deuda={v.deuda}
                        maxDeuda={maxDeudaVisitador}
                        color="bg-emerald-600"
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : null}
        </AdminGate>
      </main>

      <NavFooter />
    </div>
  );
}
