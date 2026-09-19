"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatearCOP } from "@/lib/formatoDinero";
import type { TipoFiltroVentas, VentaFila, VentanaDias } from "@/lib/ventasTipos";
import {
  construirMix,
  etiquetaTipoFiltro,
  filtrarUltimosDias,
  type MixPayload,
} from "@/lib/ventasMix";

const PIE_COLORS = [
  "#38bdf8",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#f472b6",
  "#fb923c",
  "#2dd4bf",
  "#94a3b8",
];

const STACK_COLORS = [
  "#38bdf8",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#f472b6",
  "#64748b",
];

type Props = {
  ventasRecientes: VentaFila[];
  ventanaDias: VentanaDias;
  tipoFiltro: TipoFiltroVentas;
};

const tip = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  fontSize: 12,
};

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        <p className="mt-0.5 text-xs text-zinc-500 text-pretty">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function ChartCard({
  caption,
  children,
  className = "",
}: {
  caption?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={`rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3 sm:p-4 ${className}`}
    >
      {caption ? (
        <figcaption className="mb-2 text-xs text-zinc-500">{caption}</figcaption>
      ) : null}
      {children}
    </figure>
  );
}

function HeatmapModeloColor({ mix }: { mix: MixPayload }) {
  const modelos = useMemo(() => {
    const s = new Set(mix.modelo_color.map((x) => x.modelo));
    return [...s];
  }, [mix.modelo_color]);
  const colores = useMemo(() => {
    const s = new Set(mix.modelo_color.map((x) => x.color));
    return [...s];
  }, [mix.modelo_color]);
  const lookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of mix.modelo_color) m.set(`${x.modelo}|${x.color}`, x.n);
    return m;
  }, [mix.modelo_color]);
  const maxN = Math.max(1, ...mix.modelo_color.map((x) => x.n));

  if (modelos.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">Sin datos</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[11px]">
        <caption className="sr-only">
          Heatmap unidades por modelo y color
        </caption>
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-medium text-zinc-500">
              Modelo \\ Color
            </th>
            {colores.map((c) => (
              <th
                key={c}
                className="px-1 py-1 text-center font-medium text-zinc-500"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modelos.map((mod) => (
            <tr key={mod}>
              <th className="px-2 py-1 text-left font-medium text-zinc-300">
                {mod}
              </th>
              {colores.map((col) => {
                const n = lookup.get(`${mod}|${col}`) ?? 0;
                const t = n / maxN;
                return (
                  <td key={col} className="p-0.5">
                    <div
                      className="flex h-9 min-w-[2.5rem] items-center justify-center rounded tabular-nums"
                      style={{
                        background: `oklch(${0.25 + t * 0.35} ${0.08 + t * 0.12} 250)`,
                        color: t > 0.45 ? "#f4f4f5" : "#a1a1aa",
                      }}
                      title={`${mod} · ${col}: ${n}`}
                    >
                      {n || "·"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VentasMix({
  ventasRecientes,
  ventanaDias,
  tipoFiltro,
}: Props) {
  const mix = useMemo(
    () => construirMix(filtrarUltimosDias(ventasRecientes, ventanaDias)),
    [ventasRecientes, ventanaDias],
  );

  const sedeStackData = useMemo(() => {
    return mix.sede_modelo.map((s) => ({
      sede: s.sede_label,
      ...s.modelos,
    }));
  }, [mix.sede_modelo]);

  const stackKeys = useMemo(() => {
    const keys = [...mix.top_modelos_stack];
    if (sedeStackData.some((r) => "Otros" in r)) keys.push("Otros");
    return keys;
  }, [mix.top_modelos_stack, sedeStackData]);

  const ccPct = useMemo(
    () =>
      mix.contado_credito_por_sede.map((s) => {
        const t = s.contado_n + s.credito_n || 1;
        return {
          sede: s.sede_label,
          contado_pct: Math.round((s.contado_n / t) * 1000) / 10,
          credito_pct: Math.round((s.credito_n / t) * 1000) / 10,
          contado_n: s.contado_n,
          credito_n: s.credito_n,
        };
      }),
    [mix.contado_credito_por_sede],
  );

  const top10mc = useMemo(
    () =>
      [...mix.modelo_color].sort((a, b) => b.n - a.n).slice(0, 10),
    [mix.modelo_color],
  );

  return (
    <section className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white text-balance">
          Mix de producto
        </h2>
        <p className="mt-1 text-sm text-zinc-400 text-pretty">
          {etiquetaTipoFiltro(tipoFiltro)} · últimos {ventanaDias} días (misma
          ventana que Evolución). Qué se vende: modelo, color, forma de pago y
          concentración.
        </p>
      </div>

      {/* 1 — Mix producto */}
      <Block
        title="1 · Modelo y color"
        hint="Unidades por línea de moto y combinaciones modelo×color más frecuentes."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard caption="Unidades por modelo (top + Otros)">
            <div className="h-64 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mix.por_modelo}
                  layout="vertical"
                  margin={{ left: 8, right: 8 }}
                >
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="#71717a" fontSize={11} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="key"
                    width={110}
                    stroke="#71717a"
                    fontSize={10}
                  />
                  <Tooltip contentStyle={tip} />
                  <Bar dataKey="n" name="Unidades" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard caption="Heatmap modelo × color">
            <HeatmapModeloColor mix={mix} />
          </ChartCard>
        </div>
        <ChartCard caption="Por sede × modelo (apilado)">
          <div className="h-64 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sedeStackData}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="sede" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} width={36} allowDecimals={false} />
                <Tooltip contentStyle={tip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {stackKeys.map((k, i) => (
                  <Bar
                    key={k}
                    dataKey={k}
                    stackId="m"
                    fill={STACK_COLORS[i % STACK_COLORS.length]}
                    name={k}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[360px] text-left text-[12px]">
            <caption className="sr-only">Top 10 modelo y color</caption>
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Modelo</th>
                <th className="px-3 py-2 font-medium">Color</th>
                <th className="px-3 py-2 text-right font-medium">Unidades</th>
              </tr>
            </thead>
            <tbody>
              {top10mc.map((r) => (
                <tr
                  key={`${r.modelo}-${r.color}`}
                  className="border-t border-zinc-800 text-zinc-200"
                >
                  <td className="px-3 py-1.5">{r.modelo}</td>
                  <td className="px-3 py-1.5">{r.color}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      {/* 2 — Contado vs crédito */}
      <Block
        title="2 · Contado vs crédito"
        hint="Cómo se reparte el volumen por sede. El % ayuda a comparar tiendas de distinto tamaño."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard caption="Unidades absolutas">
            <div className="h-56 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mix.contado_credito_por_sede}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="sede_label" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} width={36} allowDecimals={false} />
                  <Tooltip contentStyle={tip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="contado_n" name="Contado" fill="#34d399" />
                  <Bar dataKey="credito_n" name="Crédito" fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard caption="Composición 100%">
            <div className="h-56 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ccPct}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="sede" stroke="#71717a" fontSize={11} />
                  <YAxis stroke="#71717a" fontSize={11} width={36} domain={[0, 100]} />
                  <Tooltip contentStyle={tip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="contado_pct" stackId="p" name="% Contado" fill="#34d399" />
                  <Bar
                    dataKey="credito_pct"
                    stackId="p"
                    name="% Crédito"
                    fill="#38bdf8"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </Block>

      {/* 3 — Plan de pago */}
      <Block
        title="3 · Plan de pago"
        hint="Frecuencia de las ventas a crédito y cuota inicial media por modelo."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard caption="Frecuencia de pago (crédito)">
            <div className="h-56 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mix.por_frecuencia}
                    dataKey="n"
                    nameKey="key"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {mix.por_frecuencia.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard caption="Cuota inicial media por modelo">
            <div className="h-56 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mix.inicial_media_por_modelo}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="key" stroke="#71717a" fontSize={9} interval={0} angle={-25} textAnchor="end" height={50} />
                  <YAxis stroke="#71717a" fontSize={10} width={48} tickFormatter={(v) => `${Math.round(Number(v) / 1e6)}M`} />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v) => formatearCOP(Number(v))}
                  />
                  <Bar dataKey="inicial_media" name="Inicial media" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </Block>

      {/* 4 — Día de semana */}
      <Block
        title="4 · Ritmo del calendario"
        hint="Qué días de la semana concentran más ventas."
      >
        <ChartCard caption="Unidades por día de la semana">
          <div className="h-56 w-full" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mix.por_dow}>
                <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} width={36} allowDecimals={false} />
                <Tooltip contentStyle={tip} />
                <Bar dataKey="n" name="Unidades" fill="#fbbf24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </Block>

      {/* 5 — Pareto */}
      <Block
        title="5 · Concentración (Pareto)"
        hint="Si pocas líneas concentran el 80%, el inventario y el marketing deben enfocarse ahí."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard caption="Pareto por modelo">
            <div className="h-64 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mix.pareto_modelo}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="key" stroke="#71717a" fontSize={9} interval={0} angle={-20} textAnchor="end" height={48} />
                  <YAxis yAxisId="n" stroke="#71717a" fontSize={11} width={36} allowDecimals={false} />
                  <YAxis
                    yAxisId="pct"
                    orientation="right"
                    stroke="#a78bfa"
                    fontSize={11}
                    width={36}
                    domain={[0, 100]}
                  />
                  <Tooltip contentStyle={tip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="n" dataKey="n" name="Unidades" fill="#38bdf8" />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="pct_acum"
                    name="% acumulado"
                    stroke="#a78bfa"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard caption="Top colores + Otros">
            <div className="h-64 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mix.por_color} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis type="number" stroke="#71717a" fontSize={11} allowDecimals={false} />
                  <YAxis type="category" dataKey="key" width={80} stroke="#71717a" fontSize={10} />
                  <Tooltip contentStyle={tip} />
                  <Bar dataKey="n" name="Unidades" fill="#f472b6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </Block>

      {/* 6 — Valor */}
      <Block
        title="6 · Valor por producto y ticket"
        hint="Estimado de contrato (crédito) y valor de contado van separados: no se suman en la misma barra."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard caption="Estimado contrato vs valor contado por modelo">
            <div className="h-64 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mix.valor_por_modelo}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="key" stroke="#71717a" fontSize={9} interval={0} angle={-20} textAnchor="end" height={48} />
                  <YAxis
                    stroke="#71717a"
                    fontSize={10}
                    width={44}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1e6)}M`}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v) => formatearCOP(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="estimado_cop" name="Estimado crédito" fill="#fbbf24" />
                  <Bar dataKey="contado_valor" name="Valor contado" fill="#34d399" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <ChartCard caption="Ticket contado vs inicial media crédito (por sede)">
            <div className="h-64 w-full" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={mix.ticket_por_sede}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis dataKey="sede_label" stroke="#71717a" fontSize={11} />
                  <YAxis
                    stroke="#71717a"
                    fontSize={10}
                    width={44}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1e6)}M`}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v) => formatearCOP(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ticket_contado" name="Ticket contado" fill="#34d399" />
                  <Bar
                    dataKey="inicial_media_credito"
                    name="Inicial media crédito"
                    fill="#38bdf8"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>
      </Block>
    </section>
  );
}
