"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ForecastResult } from "@/lib/ventasForecast";
import type { DiaSerie } from "@/lib/ventasMetricas";
import { hoyBogota } from "@/lib/ventasMix";
import type { SedeId, VentanaDias } from "@/lib/ventasTipos";

const SEDE_ORDER: SedeId[] = ["bga", "girardot", "bogota", "railweb"];

const SEDE_COLOR: Record<SedeId, string> = {
  bga: "#38bdf8",
  girardot: "#34d399",
  bogota: "#a78bfa",
  railweb: "#fbbf24",
};

const SEDE_LABEL: Record<SedeId, string> = {
  bga: "BGA",
  girardot: "Girardot",
  bogota: "Bogotá",
  railweb: "Railweb",
};

type Props = {
  serie: DiaSerie[];
  forecast: ForecastResult;
  forecastPorSede: Record<SedeId, ForecastResult>;
  historiaDesde: string | null;
  ventanaDias: VentanaDias;
};

type ChartRow = {
  fecha: string;
  observado: number | null;
  yhat: number | null;
  mid: number | null;
  span: number | null;
};

function tickLabel(ymd: string): string {
  if (!ymd || ymd.length < 10) return ymd;
  const [, m, d] = ymd.split("-");
  return `${Number(d)}/${Number(m)}`;
}

function buildForecastChart(
  serie: DiaSerie[],
  forecast: ForecastResult,
  sede?: SedeId,
): ChartRow[] {
  const hist = serie.map((d) => {
    const obs = sede ? d.by_sede[sede].unidades : d.unidades;
    return {
      fecha: d.fecha,
      observado: obs as number | null,
      yhat: null as number | null,
      mid: null as number | null,
      span: null as number | null,
    };
  });
  const last = hist[hist.length - 1];
  if (last) {
    last.yhat = last.observado;
    last.mid = last.observado;
    last.span = 0;
  }
  for (const f of forecast.forecast_diario) {
    const lo = Math.round(f.lo * 10) / 10;
    const hi = Math.round(f.hi * 10) / 10;
    hist.push({
      fecha: f.fecha,
      observado: null,
      yhat: Math.round(f.yhat * 10) / 10,
      mid: lo,
      span: Math.max(0, hi - lo),
    });
  }
  return hist;
}

const tooltipStyle = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  fontSize: 12,
};

function ForecastChart({
  data,
  stroke = "#38bdf8",
  heightClass = "h-72",
  title,
}: {
  data: ChartRow[];
  stroke?: string;
  heightClass?: string;
  title: string;
}) {
  return (
    <figure className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3 sm:p-4">
      <figcaption className="mb-2 text-sm font-medium text-zinc-200">
        {title}
      </figcaption>
      <div className={`${heightClass} w-full min-h-[16rem]`} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
            <XAxis
              dataKey="fecha"
              tickFormatter={tickLabel}
              stroke="#71717a"
              fontSize={11}
              minTickGap={28}
            />
            <YAxis
              stroke="#71717a"
              fontSize={11}
              width={36}
              allowDecimals={false}
            />
            <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => String(l)} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              type="monotone"
              dataKey="mid"
              stackId="band"
              stroke="none"
              fill="transparent"
              connectNulls
              legendType="none"
              name="_base"
            />
            <Area
              type="monotone"
              dataKey="span"
              stackId="band"
              stroke="none"
              fill={stroke}
              fillOpacity={0.16}
              name="Rango proyección"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="observado"
              stroke="#f4f4f5"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name="Observado"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="yhat"
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              name="Proyección"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function VentasGrafica({
  serie,
  forecast,
  forecastPorSede,
  historiaDesde,
  ventanaDias,
}: Props) {
  const serieCortada = useMemo(() => {
    if (serie.length === 0) return serie;
    const hasta = hoyBogota();
    // mismo criterio que KPIs: N días hasta hoy Bogotá
    const desdeIdx = (() => {
      const d = new Date(`${hasta}T12:00:00-05:00`);
      d.setTime(d.getTime() - (ventanaDias - 1) * 86_400_000);
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    })();
    return serie.filter((r) => r.fecha >= desdeIdx && r.fecha <= hasta);
  }, [serie, ventanaDias]);

  const chartConsolidado = useMemo(
    () => buildForecastChart(serieCortada, forecast),
    [serieCortada, forecast],
  );

  const chartsPorSede = useMemo(() => {
    return SEDE_ORDER.map((id) => ({
      id,
      label: SEDE_LABEL[id],
      color: SEDE_COLOR[id],
      data: buildForecastChart(serieCortada, forecastPorSede[id], id),
      metodo: forecastPorSede[id]?.metodo ?? "—",
      n: forecastPorSede[id]?.n_obs ?? 0,
    }));
  }, [serieCortada, forecastPorSede]);

  const tabla14 = useMemo(() => {
    return serieCortada.slice(-14).map((d) => ({
      fecha: d.fecha,
      unidades: d.unidades,
      contado: d.contado_n,
      credito: d.credito_n,
    }));
  }, [serieCortada]);

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white text-balance">
          Evolución y proyección
        </h2>
        <p className="mt-1 text-sm text-zinc-400 text-pretty">
          Ventana: últimos {ventanaDias} días (misma que los KPIs). Historia
          desde {historiaDesde ?? "—"}. Modelo: {forecast.metodo}. Entrenado
          hasta {forecast.entrenado_hasta || "—"} ({forecast.n_obs} días).
        </p>
      </div>

      {/* 1) Consolidado */}
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-zinc-100">Consolidado</h3>
        <p className="text-xs text-zinc-500 text-pretty">
          Las cuatro tiendas sumadas: observado y proyección a 30 días.
        </p>
        <ForecastChart
          data={chartConsolidado}
          title="Todas las tiendas · unidades / día"
          stroke="#38bdf8"
        />
      </div>

      {/* 2) Tienda por tienda */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">
            Tienda por tienda
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 text-pretty">
            Misma ventana y proyección, una gráfica por sede.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {chartsPorSede.map((s) => (
            <div key={s.id} className="flex flex-col gap-1">
              <p className="text-[11px] text-zinc-500">
                {s.metodo} · {s.n} días de historia
              </p>
              <ForecastChart
                data={s.data}
                title={`${s.label} · unidades / día`}
                stroke={s.color}
                heightClass="h-56"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[480px] text-left text-[12px]">
          <caption className="sr-only">
            Últimos 14 días de unidades observadas
          </caption>
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              {["Fecha", "Unidades", "Contado", "Crédito"].map((h, i) => (
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
            {tabla14.map((r) => (
              <tr key={r.fecha} className="border-t border-zinc-800 text-zinc-200">
                <td className="px-3 py-1.5 tabular-nums">{r.fecha}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.unidades}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-300">
                  {r.contado}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-sky-300">
                  {r.credito}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
