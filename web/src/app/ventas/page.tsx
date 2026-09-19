"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { VentasGrafica } from "@/components/VentasGrafica";
import { VentasMix } from "@/components/VentasMix";
import { formatearCOP } from "@/lib/formatoDinero";
import {
  forecastUnidades,
  type ForecastResult,
} from "@/lib/ventasForecast";
import {
  construirSerieCliente,
  etiquetaTipoFiltro,
  filtrarPorTipo,
  hoyBogota,
  kpisDeVentana,
} from "@/lib/ventasMix";
import type {
  SedeId,
  TipoFiltroVentas,
  TotalesKpi,
  VentanaDias,
  VentasPayload,
} from "@/lib/ventasMetricas";

const VENTANAS: VentanaDias[] = [3, 7, 15, 30, 60, 90, 120];
const TIPOS: { id: TipoFiltroVentas; label: string }[] = [
  { id: "credito", label: "Crédito" },
  { id: "contado", label: "Contado" },
  { id: "ambos", label: "Ambos" },
];

const SEDE_ORDER: SedeId[] = ["bga", "girardot", "bogota", "railweb"];

const SEDE_LABEL: Record<SedeId, string> = {
  bga: "Bucaramanga (BGA)",
  girardot: "Girardot",
  bogota: "Bogotá",
  railweb: "Railweb (Julian)",
};

const FORECAST_VACIO: ForecastResult = forecastUnidades([]);

function VentanaChips({
  ventanaDias,
  onChange,
}: {
  ventanaDias: VentanaDias;
  onChange: (d: VentanaDias) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Ventana de KPIs y gráficas"
    >
      {VENTANAS.map((d) => {
        const active = ventanaDias === d;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={active}
            className={`min-h-11 rounded-lg px-3 text-xs font-medium transition-transform active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
              active
                ? "bg-zinc-100 text-zinc-900"
                : "border border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            {d} días
          </button>
        );
      })}
    </div>
  );
}

function TipoChips({
  tipo,
  onChange,
}: {
  tipo: TipoFiltroVentas;
  onChange: (t: TipoFiltroVentas) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Tipo de venta"
    >
      {TIPOS.map(({ id, label }) => {
        const active = tipo === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-pressed={active}
            className={`min-h-11 rounded-lg px-3 text-xs font-medium transition-transform active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
              active
                ? "bg-sky-400 text-zinc-950"
                : "border border-zinc-700 bg-zinc-900 text-zinc-400"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function deltaParts(
  actual: number,
  prev: number,
  esDinero = false,
): { dir: "up" | "down" | "flat"; text: string; aria: string } {
  const d = actual - prev;
  if (d === 0) {
    return {
      dir: "flat",
      text: "Sin cambio",
      aria: "Sin cambio frente al periodo anterior",
    };
  }
  const sign = d > 0 ? "+" : "";
  const text = esDinero
    ? `${sign}${formatearCOPCorto(d)}`
    : `${sign}${d.toLocaleString("es-CO")}`;
  const ariaFull = esDinero
    ? `${sign}${formatearCOP(d)}`
    : text;
  return {
    dir: d > 0 ? "up" : "down",
    text,
    aria: `${ariaFull} frente al periodo anterior`,
  };
}

function DeltaBadge({
  actual,
  prev,
  esDinero = false,
}: {
  actual: number;
  prev: number;
  esDinero?: boolean;
}) {
  const { dir, text, aria } = deltaParts(actual, prev, esDinero);
  const tone =
    dir === "up"
      ? "text-emerald-300"
      : dir === "down"
        ? "text-rose-300"
        : "text-zinc-400";
  const mark = dir === "up" ? "↑" : dir === "down" ? "↓" : "·";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[12px] font-medium tabular-nums ${tone}`}
      aria-label={aria}
    >
      <span aria-hidden="true" className="text-[13px] leading-none">
        {mark}
      </span>
      <span>{text}</span>
    </span>
  );
}

function formatearCOPCorto(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000_000) {
    return `$ ${(val / 1_000_000_000).toLocaleString("es-CO", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    })} mil M`;
  }
  if (abs >= 1_000_000) {
    return `$ ${(val / 1_000_000).toLocaleString("es-CO", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    })} M`;
  }
  return formatearCOP(val);
}

function KpiMetric({
  value,
  label,
  actual,
  prev,
  esDinero = false,
}: {
  value: string;
  label: string;
  actual: number;
  prev: number;
  esDinero?: boolean;
}) {
  const display = esDinero ? formatearCOPCorto(actual) : value;
  const full = esDinero ? formatearCOP(actual) : value;
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-zinc-400">{label}</p>
      <p
        className="mt-1 break-words text-lg font-semibold tabular-nums tracking-tight text-zinc-50 sm:text-xl"
        title={full}
        aria-label={full}
      >
        {display}
      </p>
      <div className="mt-1.5">
        <DeltaBadge actual={actual} prev={prev} esDinero={esDinero} />
      </div>
    </div>
  );
}

function KpiPanel({
  t,
  prev,
  heroHint,
  heading,
  headingId,
  ok = true,
  error,
  tipoFiltro = "ambos",
}: {
  t: TotalesKpi;
  prev: TotalesKpi;
  heroHint: string;
  heading?: string;
  headingId?: string;
  ok?: boolean;
  error?: string | null;
  tipoFiltro?: TipoFiltroVentas;
}) {
  const showContado = tipoFiltro === "ambos" || tipoFiltro === "contado";
  const showCredito = tipoFiltro === "ambos" || tipoFiltro === "credito";
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.04)]">
      {heading ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 px-5 py-3 sm:px-6">
          <h3
            id={headingId}
            className="text-base font-semibold tracking-tight text-white"
          >
            {heading}
          </h3>
          {!ok && (
            <span className="rounded-md bg-red-950/60 px-2 py-0.5 text-[11px] text-red-300">
              Error
            </span>
          )}
        </div>
      ) : null}
      {error ? (
        <p className="border-b border-zinc-800/80 px-5 py-2 text-xs text-red-300/90 text-pretty sm:px-6">
          {error}
        </p>
      ) : null}

      <div className="relative border-b border-zinc-800/80 px-5 py-5 sm:px-6 sm:py-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_120px_at_10%_-20%,oklch(0.55_0.12_250/0.18),transparent_70%)]"
          aria-hidden="true"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Unidades
              {tipoFiltro === "credito"
                ? " crédito"
                : tipoFiltro === "contado"
                  ? " contado"
                  : " totales"}
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-white sm:text-5xl">
              {t.total_n.toLocaleString("es-CO")}
            </p>
            <div className="mt-2">
              <DeltaBadge actual={t.total_n} prev={prev.total_n} />
            </div>
          </div>
          <p className="max-w-[14rem] text-right text-[12px] leading-relaxed text-zinc-500 text-pretty">
            {heroHint}
          </p>
        </div>
      </div>

      {tipoFiltro === "ambos" ? (
        <div className="grid divide-y divide-zinc-800/80 md:grid-cols-2 md:divide-x md:divide-y-0">
          <div className="px-5 py-5 sm:px-6">
            <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90">
              <span
                className="inline-block size-1.5 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              Contado
            </p>
            <div className="grid grid-cols-2 gap-6">
              <KpiMetric
                label="Unidades"
                value={t.contado_n.toLocaleString("es-CO")}
                actual={t.contado_n}
                prev={prev.contado_n}
              />
              <KpiMetric
                label="Valor venta"
                value={formatearCOP(t.contado_valor)}
                actual={t.contado_valor}
                prev={prev.contado_valor}
                esDinero
              />
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6">
            <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-400/90">
              <span
                className="inline-block size-1.5 rounded-full bg-sky-400"
                aria-hidden="true"
              />
              Crédito
            </p>
            <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-3">
              <KpiMetric
                label="Unidades"
                value={t.credito_n.toLocaleString("es-CO")}
                actual={t.credito_n}
                prev={prev.credito_n}
              />
              <KpiMetric
                label="Cuotas iniciales"
                value={formatearCOP(t.credito_inicial_total)}
                actual={t.credito_inicial_total}
                prev={prev.credito_inicial_total}
                esDinero
              />
              <KpiMetric
                label="Estimado contrato"
                value={formatearCOP(t.credito_estimado_total)}
                actual={t.credito_estimado_total}
                prev={prev.credito_estimado_total}
                esDinero
              />
            </div>
          </div>
        </div>
      ) : showContado ? (
        <div className="px-5 py-5 sm:px-6">
          <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-400/90">
            <span
              className="inline-block size-1.5 rounded-full bg-emerald-400"
              aria-hidden="true"
            />
            Contado
          </p>
          <div className="grid grid-cols-2 gap-6">
            <KpiMetric
              label="Unidades"
              value={t.contado_n.toLocaleString("es-CO")}
              actual={t.contado_n}
              prev={prev.contado_n}
            />
            <KpiMetric
              label="Valor venta"
              value={formatearCOP(t.contado_valor)}
              actual={t.contado_valor}
              prev={prev.contado_valor}
              esDinero
            />
          </div>
        </div>
      ) : showCredito ? (
        <div className="px-5 py-5 sm:px-6">
          <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-400/90">
            <span
              className="inline-block size-1.5 rounded-full bg-sky-400"
              aria-hidden="true"
            />
            Crédito
          </p>
          <div className="grid grid-cols-1 gap-5 min-[420px]:grid-cols-3">
            <KpiMetric
              label="Unidades"
              value={t.credito_n.toLocaleString("es-CO")}
              actual={t.credito_n}
              prev={prev.credito_n}
            />
            <KpiMetric
              label="Cuotas iniciales"
              value={formatearCOP(t.credito_inicial_total)}
              actual={t.credito_inicial_total}
              prev={prev.credito_inicial_total}
              esDinero
            />
            <KpiMetric
              label="Estimado contrato"
              value={formatearCOP(t.credito_estimado_total)}
              actual={t.credito_estimado_total}
              prev={prev.credito_estimado_total}
              esDinero
            />
          </div>
        </div>
      ) : null}

      <div className="border-t border-zinc-800/80 px-5 py-5 sm:px-6">
        <p className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-400/90">
          <span
            className="inline-block size-1.5 rounded-full bg-amber-400"
            aria-hidden="true"
          />
          Condición
        </p>
        <div className="grid grid-cols-2 gap-6 min-[420px]:grid-cols-3">
          <KpiMetric
            label="Nuevas"
            value={t.nuevas_n.toLocaleString("es-CO")}
            actual={t.nuevas_n}
            prev={prev.nuevas_n}
          />
          <KpiMetric
            label="De segunda"
            value={t.segunda_n.toLocaleString("es-CO")}
            actual={t.segunda_n}
            prev={prev.segunda_n}
          />
          {t.desconocida_n > 0 || prev.desconocida_n > 0 ? (
            <KpiMetric
              label="Sin clasificar"
              value={t.desconocida_n.toLocaleString("es-CO")}
              actual={t.desconocida_n}
              prev={prev.desconocida_n}
            />
          ) : null}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 text-pretty">
          Segunda = segunda mano o recuperada. Railweb y filas sin señal
          quedan sin clasificar.
        </p>
      </div>
    </div>
  );
}

function fechaLegible(ymd: string): string {
  if (!ymd || ymd.length < 10) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${d} ${meses[m - 1]} ${y}`;
}

function KpiSection({
  t,
  prev,
  desde,
  hasta,
  ventanaDias,
  onVentanaDiasChange,
  tipoFiltro,
  onTipoFiltroChange,
}: {
  t: TotalesKpi;
  prev: TotalesKpi;
  desde: string;
  hasta: string;
  ventanaDias: VentanaDias;
  onVentanaDiasChange: (d: VentanaDias) => void;
  tipoFiltro: TipoFiltroVentas;
  onTipoFiltroChange: (t: TipoFiltroVentas) => void;
}) {
  const periodo =
    desde && hasta
      ? `${fechaLegible(desde)} – ${fechaLegible(hasta)}`
      : "Sin datos";
  return (
    <section aria-labelledby="kpi-periodo-titulo" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="kpi-periodo-titulo"
            className="text-lg font-semibold tracking-tight text-white text-balance"
          >
            Últimos {ventanaDias} días
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            <span className="sr-only">Del </span>
            {periodo}
            <span className="sr-only">
              . {etiquetaTipoFiltro(tipoFiltro)}. Comparado con los{" "}
              {ventanaDias} días anteriores.
            </span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <TipoChips tipo={tipoFiltro} onChange={onTipoFiltroChange} />
          <VentanaChips
            ventanaDias={ventanaDias}
            onChange={onVentanaDiasChange}
          />
        </div>
      </div>

      <KpiPanel
        t={t}
        prev={prev}
        tipoFiltro={tipoFiltro}
        heroHint={`${etiquetaTipoFiltro(tipoFiltro)} · las cuatro sedes`}
      />
    </section>
  );
}

export default function VentasPage() {
  const [data, setData] = useState<VentasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ventanaDias, setVentanaDias] = useState<VentanaDias>(90);
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltroVentas>("credito");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas?refresh=1", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar");
      setData(json as VentasPayload);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar. Revisa la conexión e inténtalo de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ventasFiltradas = useMemo(() => {
    if (!data) return [];
    return filtrarPorTipo(data.ventas_recientes, tipoFiltro);
  }, [data, tipoFiltro]);

  const ventasDetalle = useMemo(() => {
    if (!data) return [];
    return filtrarPorTipo(data.ventas, tipoFiltro);
  }, [data, tipoFiltro]);

  const kpis = useMemo(() => {
    if (!data) return null;
    return kpisDeVentana(ventasFiltradas, ventanaDias, hoyBogota());
  }, [data, ventasFiltradas, ventanaDias]);

  const kpisSedes = useMemo(() => {
    if (!data || !kpis?.hasta) return [];
    return SEDE_ORDER.map((id) => {
      const meta = data.sedes.find((s) => s.id === id);
      const slice = kpisDeVentana(
        ventasFiltradas.filter((v) => v.sede === id),
        ventanaDias,
        kpis.hasta,
      );
      return {
        id,
        label: meta?.label ?? SEDE_LABEL[id],
        ok: meta?.ok ?? true,
        error: meta?.error ?? null,
        ...slice,
      };
    });
  }, [data, ventasFiltradas, ventanaDias, kpis?.hasta]);

  const serieFiltrada = useMemo(
    () => construirSerieCliente(ventasFiltradas),
    [ventasFiltradas],
  );

  const forecastFiltrado = useMemo(() => {
    if (serieFiltrada.length === 0) return FORECAST_VACIO;
    return forecastUnidades(
      serieFiltrada.map((d) => ({
        fecha: d.fecha,
        unidades: d.unidades,
        estimado_cop: d.estimado_cop,
        contado_n: d.contado_n,
        credito_n: d.credito_n,
      })),
      30,
    );
  }, [serieFiltrada]);

  const forecastPorSede = useMemo(() => {
    const out = {} as Record<SedeId, ForecastResult>;
    for (const id of SEDE_ORDER) {
      const pts = serieFiltrada.map((d) => ({
        fecha: d.fecha,
        unidades: d.by_sede[id].unidades,
        estimado_cop: d.by_sede[id].estimado_cop,
        contado_n: 0,
        credito_n: 0,
      }));
      out[id] = pts.some((p) => p.unidades > 0)
        ? forecastUnidades(pts, 30)
        : FORECAST_VACIO;
    }
    return out;
  }, [serieFiltrada]);

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 pb-20 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Público · sin clave · cache ~15 min · cron 6:00 Colombia
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-white text-balance">
              Ventas de motos
            </h1>
            <p className="mt-2 text-sm text-zinc-400 text-pretty">
              Filtra crédito, contado o ambos · BGA, Girardot, Bogotá y
              Railweb. Crédito = inicial confirmada (fecha = selección).
            </p>
          </div>
          <button
            type="button"
            onClick={() => void cargar()}
            className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition-transform active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Actualizar
          </button>
        </header>

        <div role="status" aria-live="polite" className="sr-only">
          {loading
            ? "Cargando métricas"
            : error
              ? `Error: ${error}`
              : data
                ? `Métricas cargadas · ${etiquetaTipoFiltro(tipoFiltro)}`
                : ""}
        </div>

        {loading && (
          <p className="text-sm text-zinc-500">Cargando métricas e historia…</p>
        )}
        {error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3">
            <p className="text-sm text-red-200">{error}</p>
            <button
              type="button"
              onClick={() => void cargar()}
              className="mt-2 min-h-11 rounded-lg border border-red-800 bg-red-950 px-3 text-xs font-medium text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
            >
              Reintentar
            </button>
          </div>
        )}

        {data && kpis && (
          <>
            <KpiSection
              t={kpis.totales}
              prev={kpis.totales_prev}
              desde={kpis.desde}
              hasta={kpis.hasta}
              ventanaDias={ventanaDias}
              onVentanaDiasChange={setVentanaDias}
              tipoFiltro={tipoFiltro}
              onTipoFiltroChange={setTipoFiltro}
            />

            <VentasGrafica
              serie={serieFiltrada}
              forecast={forecastFiltrado}
              forecastPorSede={forecastPorSede}
              historiaDesde={data.historia_desde}
              ventanaDias={ventanaDias}
              tipoFiltro={tipoFiltro}
            />

            <VentasMix
              ventasRecientes={ventasFiltradas}
              ventanaDias={ventanaDias}
              tipoFiltro={tipoFiltro}
            />

            <section className="flex flex-col gap-4" aria-labelledby="por-sede-titulo">
              <div>
                <h2
                  id="por-sede-titulo"
                  className="text-lg font-semibold tracking-tight text-white text-balance"
                >
                  Por sede
                </h2>
                <p className="mt-1 text-sm text-zinc-400 text-pretty">
                  {etiquetaTipoFiltro(tipoFiltro)} · últimos {ventanaDias} días
                  {kpis.desde && kpis.hasta
                    ? ` (${fechaLegible(kpis.desde)} – ${fechaLegible(kpis.hasta)})`
                    : ""}
                  .
                </p>
              </div>
              {kpisSedes.map((s) => (
                <KpiPanel
                  key={s.id}
                  heading={s.label}
                  headingId={`sede-${s.id}`}
                  t={s.totales}
                  prev={s.totales_prev}
                  tipoFiltro={tipoFiltro}
                  heroHint={`${etiquetaTipoFiltro(tipoFiltro)} · esta sede`}
                  ok={s.ok}
                  error={s.error}
                />
              ))}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">
                Resumen por sede
              </h2>
              <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      {[
                        "Sede",
                        "Contado",
                        "Valor contado",
                        "Crédito",
                        "Cuotas iniciales",
                        "Estimado contrato",
                        "Total u.",
                      ].map((h, i) => (
                        <th
                          key={h}
                          className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kpisSedes.map((s, i) => (
                      <tr
                        key={s.id}
                        className={
                          i === 0
                            ? "bg-sky-950/30 text-zinc-100"
                            : "border-t border-zinc-800 text-zinc-200"
                        }
                      >
                        <td className="px-3 py-2">
                          {s.label}
                          {!s.ok && (
                            <span className="ml-1 text-[10px] text-red-400">
                              (error)
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                          {s.totales.contado_n}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatearCOP(s.totales.contado_valor)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-300">
                          {s.totales.credito_n}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatearCOP(s.totales.credito_inicial_total)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatearCOP(s.totales.credito_estimado_total)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {s.totales.total_n}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-zinc-700 bg-zinc-900 font-semibold text-white">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {kpis.totales.contado_n}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatearCOP(kpis.totales.contado_valor)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {kpis.totales.credito_n}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatearCOP(kpis.totales.credito_inicial_total)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatearCOP(kpis.totales.credito_estimado_total)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {kpis.totales.total_n}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">
                Detalle del periodo ({ventasDetalle.length})
              </h2>
              <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                <table className="w-full min-w-[780px] text-left text-[12px]">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      {[
                        "Fecha",
                        "Sede",
                        "Tipo",
                        "Condición",
                        "Placa",
                        "Modelo",
                        "Valor",
                      ].map((h, i) => (
                          <th
                            key={h}
                            className={`px-3 py-2 font-medium ${i >= 6 ? "text-right" : "text-left"}`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ventasDetalle.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-6 text-center text-zinc-500"
                        >
                          Sin ventas en el periodo
                        </td>
                      </tr>
                    ) : (
                      ventasDetalle.map((v) => (
                        <tr
                          key={v.id}
                          className="border-t border-zinc-800 text-zinc-200"
                        >
                          <td className="px-3 py-2 tabular-nums whitespace-nowrap">
                            {fechaLegible(v.fecha)}
                          </td>
                          <td className="px-3 py-2">{v.sede_label}</td>
                          <td className="px-3 py-2">
                            <span
                              className={
                                v.tipo === "contado"
                                  ? "text-emerald-300"
                                  : "text-sky-300"
                              }
                            >
                              {v.tipo}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {v.condicion === "nueva"
                              ? "Nueva"
                              : v.condicion === "segunda"
                                ? "Segunda"
                                : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px]">
                            {v.placa ?? "—"}
                          </td>
                          <td className="px-3 py-2 max-w-[140px] truncate">
                            {v.modelo ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatearCOP(v.valor)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-[11px] leading-relaxed text-zinc-600 text-pretty">
              Generado{" "}
              {new Date(data.generado_en).toLocaleString("es-CO", {
                timeZone: "America/Bogota",
              })}
              . Vista: {etiquetaTipoFiltro(tipoFiltro)}. Crédito = inicial
              confirmada (fecha = selección). Contado = ventas_moto. Condición:
              nueva vs segunda.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
