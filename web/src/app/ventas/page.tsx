"use client";

import { useCallback, useEffect, useState } from "react";

import { formatearCOP } from "@/lib/formatoDinero";
import type { SedeMetricas, VentasPayload } from "@/lib/ventasMetricas";

function Stat({
  value,
  label,
  tone = "neutral",
}: {
  value: string;
  label: string;
  tone?: "neutral" | "info" | "success" | "warning";
}) {
  const color =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "info"
          ? "text-sky-300"
          : "text-white";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-3">
      <p className={`text-lg font-bold tabular-nums tracking-tight ${color}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">{label}</p>
    </div>
  );
}

function SedeBlock({ s }: { s: SedeMetricas }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-white">{s.label}</h2>
        {!s.ok && (
          <span className="rounded-md bg-red-950/60 px-2 py-0.5 text-[11px] text-red-300">
            Error
          </span>
        )}
      </div>
      {s.error && (
        <p className="mb-3 text-xs text-red-300/90 text-pretty">{s.error}</p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          value={s.contado_n.toLocaleString("es-CO")}
          label="Contado (unidades)"
          tone="success"
        />
        <Stat
          value={formatearCOP(s.contado_valor)}
          label="Contado (valor venta)"
          tone="success"
        />
        <Stat
          value={s.credito_n.toLocaleString("es-CO")}
          label="Crédito (unidades)"
          tone="info"
        />
        <Stat
          value={formatearCOP(s.credito_valor)}
          label={
            s.id === "railweb"
              ? "Crédito (estimado contrato)"
              : "Crédito (cuotas iniciales)"
          }
          tone="info"
        />
      </div>
    </section>
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

export default function VentasPage() {
  const [data, setData] = useState<VentasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ventas", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar");
      setData(json as VentasPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const t = data?.totales;

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 pb-16">
        <header>
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Solo lectura · no aparece en el menú
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            Ventas de motos
          </h1>
          <p className="mt-1 text-sm text-zinc-400 text-pretty">
            Contado y crédito · BGA + Girardot + Bogotá + Railweb (Julian).
            {data
              ? ` Del ${fechaLegible(data.desde)} al ${fechaLegible(data.hasta)}.`
              : " Del 1° del mes anterior hasta hoy."}
          </p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 active:bg-zinc-800"
          >
            Actualizar
          </button>
        </header>

        {loading && (
          <p className="text-sm text-zinc-500">Cargando métricas…</p>
        )}
        {error && (
          <p className="rounded-xl border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        {data && t && (
          <>
            <section>
              <h2 className="mb-3 text-base font-semibold text-white">
                Total consolidado
              </h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat
                  value={t.total_n.toLocaleString("es-CO")}
                  label="Unidades totales"
                />
                <Stat
                  value={t.contado_n.toLocaleString("es-CO")}
                  label="Contado (unidades)"
                  tone="success"
                />
                <Stat
                  value={formatearCOP(t.contado_valor)}
                  label="Contado (valor venta)"
                  tone="success"
                />
                <Stat
                  value={t.credito_n.toLocaleString("es-CO")}
                  label="Crédito (unidades)"
                  tone="info"
                />
                <Stat
                  value={formatearCOP(t.credito_valor_sp)}
                  label="Crédito SP (cuotas iniciales)"
                  tone="info"
                />
                <Stat
                  value={formatearCOP(t.credito_valor_railweb)}
                  label="Crédito Railweb (estimado)"
                  tone="warning"
                />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-zinc-600 text-pretty">
                Contado y crédito no se suman en pesos: en SP el crédito solo
                guarda cuota inicial; en Railweb el valor es estimado
                (inicial + tarifa × días). Unidades sí se suman.
              </p>
            </section>

            <section className="flex flex-col gap-4">
              <h2 className="text-base font-semibold text-white">Por sede</h2>
              {data.sedes.map((s) => (
                <SedeBlock key={s.id} s={s} />
              ))}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-white">
                Resumen por sede
              </h3>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      {[
                        "Sede",
                        "Contado",
                        "Valor contado",
                        "Crédito",
                        "Valor crédito",
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
                    {data.sedes.map((s, i) => (
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
                          {s.contado_n}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatearCOP(s.contado_valor)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-300">
                          {s.credito_n}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatearCOP(s.credito_valor)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {s.total_n}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-zinc-700 bg-zinc-900 font-semibold text-white">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.contado_n}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatearCOP(t.contado_valor)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.credito_n}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-400">
                        —
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.total_n}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-sm font-semibold text-white">
                Detalle ({data.ventas.length})
              </h3>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full min-w-[720px] text-left text-[12px]">
                  <thead className="bg-zinc-900 text-zinc-400">
                    <tr>
                      {["Fecha", "Sede", "Tipo", "Placa", "Modelo", "Valor"].map(
                        (h, i) => (
                          <th
                            key={h}
                            className={`px-3 py-2 font-medium ${i >= 5 ? "text-right" : "text-left"}`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.ventas.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-3 py-6 text-center text-zinc-500"
                        >
                          Sin ventas en el periodo
                        </td>
                      </tr>
                    ) : (
                      data.ventas.map((v) => (
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

            <p className="text-[11px] text-zinc-600">
              Generado {new Date(data.generado_en).toLocaleString("es-CO", {
                timeZone: "America/Bogota",
              })}
              . Solo consultas SELECT. Railweb no tiene ventas de contado.
              Crédito SP: estados entregada/saldada. Contado: filas en
              ventas_moto.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
