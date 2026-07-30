"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { NavFooter } from "@/components/NavFooter";
import { formatearCOP } from "@/lib/formatoDinero";
import type { EstadoGpsPlaca } from "@/lib/gpsEstadoPlacas";

/** Umbral campo vs llamada — espejo de DEUDA_MIN_RECOGER_CAMPO_COP en recogerBogota.ts */
const DEUDA_MIN_RECOGER_CAMPO_COP = 700_000;

type FiltroGps = "con_gps" | "todos";
type VistaTab = "recoger" | "llamar";

type MotoRecogerBogota = {
  placa: string;
  nombre: string;
  telefono: string;
  cedula: string;
  deuda_total: number;
  cuotas_pendientes: number;
  valor_cuota: number;
  pago_hoy: boolean;
  lat: number | null;
  lng: number | null;
  distancia_km: number | null;
  gps: EstadoGpsPlaca;
  frecuencia_etiqueta: string;
  dias_promedio_entre_pagos: number;
  pagos_irregulares: boolean;
};

type ResumenRecogerBogota = {
  total: number;
  con_gps: number;
  deuda_total: number;
  generado_en: string;
};

function BadgeGps({ gps }: { gps: EstadoGpsPlaca }) {
  if (gps.funcional) {
    return (
      <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded">
        GPS {gps.proveedor_etiqueta} · {gps.estado_etiqueta}
      </span>
    );
  }
  if (gps.online) {
    return (
      <span className="text-[10px] font-semibold text-amber-300/90 bg-amber-950/40 px-1.5 py-0.5 rounded">
        GPS {gps.estado_etiqueta}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
      Sin GPS
    </span>
  );
}

function formatearDistancia(km: number | null): string {
  if (km == null) return "Sin GPS";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatearCadaCuantosDias(media: number): string {
  if (!media || media <= 0) return "Sin patrón";
  const dias = Math.max(1, Math.round(media));
  return dias === 1 ? "Cada día" : `Cada ${dias} días`;
}

function enlaceMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

function digitosTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

function enlaceTel(telefono: string): string | null {
  const digits = digitosTelefono(telefono);
  if (digits.length < 7) return null;
  return `tel:${digits}`;
}

function ContenidoRecogerBogota() {
  const [motos, setMotos] = useState<MotoRecogerBogota[]>([]);
  const [resumen, setResumen] = useState<ResumenRecogerBogota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [vista, setVista] = useState<VistaTab>("recoger");
  const [filtroGps, setFiltroGps] = useState<FiltroGps>("con_gps");

  const cargar = useCallback(async (force = false) => {
    const q = force ? "?refresh=1" : "";
    const res = await fetch(`/api/placas/recoger-bogota${q}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? "Error al cargar Recoger Bogotá");
    }
    setMotos(data.motos ?? []);
    setResumen(data.resumen ?? null);
    setError(null);
  }, []);

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

  const { paraRecoger, paraLlamar } = useMemo(() => {
    const recoger: MotoRecogerBogota[] = [];
    const llamar: MotoRecogerBogota[] = [];
    for (const m of motos) {
      if (m.deuda_total >= DEUDA_MIN_RECOGER_CAMPO_COP) recoger.push(m);
      else llamar.push(m);
    }
    return { paraRecoger: recoger, paraLlamar: llamar };
  }, [motos]);

  const lista = useMemo(() => {
    const base = vista === "recoger" ? paraRecoger : paraLlamar;
    const q = busqueda.trim().toUpperCase();
    return base.filter((m) => {
      if (vista === "recoger" && filtroGps === "con_gps" && m.distancia_km == null) {
        return false;
      }
      if (!q) return true;
      return (
        m.placa.toUpperCase().includes(q) ||
        m.nombre.toUpperCase().includes(q) ||
        m.cedula.includes(q) ||
        digitosTelefono(m.telefono).includes(q.replace(/\D/g, ""))
      );
    });
  }, [vista, paraRecoger, paraLlamar, busqueda, filtroGps]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="shrink-0 px-4 pt-3 pb-2 border-b border-zinc-800/80 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">
              Recoger Bogotá
            </h1>
            <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
              ≥ $700.000 campo · $200k–$700k llamar · cercanas primero
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void cargar(true).finally(() => setLoading(false));
            }}
            disabled={loading}
            className="shrink-0 px-3 min-h-[40px] rounded-xl bg-zinc-800 border border-zinc-600 text-xs font-medium disabled:opacity-50"
            title="Actualizar"
          >
            ↻
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setVista("recoger")}
            className={`rounded-xl border px-2 py-2 text-center min-h-[52px] ${
              vista === "recoger"
                ? "border-rose-700 bg-rose-950/50"
                : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">
              Recoger
            </p>
            <p className="text-sm font-bold tabular-nums text-rose-300">
              {paraRecoger.length}
            </p>
            <p className="text-[9px] text-zinc-500">≥ $700k</p>
          </button>
          <button
            type="button"
            onClick={() => setVista("llamar")}
            className={`rounded-xl border px-2 py-2 text-center min-h-[52px] ${
              vista === "llamar"
                ? "border-sky-700 bg-sky-950/50"
                : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            <p className="text-[9px] uppercase tracking-wider text-zinc-500">
              Llamar
            </p>
            <p className="text-sm font-bold tabular-nums text-sky-300">
              {paraLlamar.length}
            </p>
            <p className="text-[9px] text-zinc-500">&lt; $700k</p>
          </button>
        </div>

        {resumen && (
          <p className="text-[10px] text-zinc-500 tabular-nums">
            Total {resumen.total} · GPS {resumen.con_gps} · deuda{" "}
            {formatearCOP(resumen.deuda_total)}
          </p>
        )}

        <div className="flex gap-1.5">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar placa, nombre, teléfono…"
            className="flex-1 min-h-[40px] rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          {vista === "recoger" && (
            <button
              type="button"
              onClick={() =>
                setFiltroGps((f) => (f === "con_gps" ? "todos" : "con_gps"))
              }
              className={`shrink-0 px-3 min-h-[40px] rounded-xl text-[11px] font-semibold border ${
                filtroGps === "con_gps"
                  ? "bg-emerald-900/50 border-emerald-700 text-emerald-200"
                  : "bg-zinc-900 border-zinc-700 text-zinc-400"
              }`}
            >
              {filtroGps === "con_gps" ? "Solo GPS" : "Todas"}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-3 pb-2">
        {loading && (
          <p className="text-center text-sm text-zinc-500 py-12">
            Cargando motos y GPS…
          </p>
        )}
        {error && (
          <p className="text-center text-sm text-red-400 py-8">{error}</p>
        )}
        {!loading && !error && lista.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-12">
            {vista === "recoger"
              ? `No hay motos ≥ $700.000${filtroGps === "con_gps" ? " con GPS" : ""}.`
              : "No hay motos entre $200.000 y $700.000."}
          </p>
        )}
        {!loading && !error && lista.length > 0 && (
          <ul className="flex flex-col gap-2">
            {lista.map((m, i) => {
              const telHref = enlaceTel(m.telefono);
              return (
                <li
                  key={m.placa}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-3"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-[11px] font-bold text-zinc-600 w-5 tabular-nums pt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-base font-bold tracking-wide text-white">
                          {m.placa}
                        </p>
                        <p className="text-sm font-bold tabular-nums text-rose-300 shrink-0">
                          {formatearCOP(m.deuda_total)}
                        </p>
                      </div>
                      <p className="text-[12px] text-zinc-400 truncate">
                        {m.nombre || "—"}
                      </p>

                      {vista === "llamar" && (
                        <div className="flex flex-wrap items-center gap-2">
                          {telHref ? (
                            <a
                              href={telHref}
                              className="text-base font-bold tabular-nums tracking-wide text-sky-300 hover:text-sky-200"
                            >
                              {m.telefono.trim() || digitosTelefono(m.telefono)}
                            </a>
                          ) : (
                            <span className="text-[12px] text-zinc-500">
                              Sin teléfono
                            </span>
                          )}
                          {telHref && (
                            <a
                              href={telHref}
                              className="text-[11px] font-semibold text-sky-200 bg-sky-950/60 px-2 py-1 rounded-lg border border-sky-800"
                            >
                              Llamar
                            </a>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-1.5">
                        {vista === "recoger" && (
                          <span
                            className={`text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                              m.distancia_km != null
                                ? "text-sky-200 bg-sky-950/50"
                                : "text-zinc-500 bg-zinc-800"
                            }`}
                          >
                            {formatearDistancia(m.distancia_km)}
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded">
                          {formatearCadaCuantosDias(m.dias_promedio_entre_pagos)}
                          {m.frecuencia_etiqueta &&
                          m.dias_promedio_entre_pagos > 0
                            ? ` · ${m.frecuencia_etiqueta}`
                            : ""}
                        </span>
                        {m.dias_promedio_entre_pagos > 0 && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              m.pagos_irregulares
                                ? "text-amber-300 bg-amber-950/50"
                                : "text-emerald-300 bg-emerald-950/50"
                            }`}
                          >
                            {m.pagos_irregulares ? "Irregular" : "Regular"}
                          </span>
                        )}
                        {vista === "recoger" && <BadgeGps gps={m.gps} />}
                        {m.pago_hoy && (
                          <span className="text-[10px] font-semibold text-emerald-400/90 bg-emerald-950/40 px-1.5 py-0.5 rounded">
                            Pagó hoy
                          </span>
                        )}
                        <span className="text-[10px] text-zinc-500">
                          {m.cuotas_pendientes} cuotas
                        </span>
                      </div>
                      {vista === "recoger" && m.lat != null && m.lng != null && (
                        <a
                          href={enlaceMaps(m.lat, m.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          Abrir en Maps →
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

export default function RecogerBogotaPage() {
  return (
    <div className="flex flex-col h-dvh max-w-[414px] mx-auto bg-zinc-950 text-zinc-100 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <AdminGate
          title="Recoger Bogotá"
          subtitle="Contraseña admin (misma que Admin — Nicolas)"
        >
          <ContenidoRecogerBogota />
        </AdminGate>
      </div>
      <NavFooter />
    </div>
  );
}
