"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { NavFooter } from "@/components/NavFooter";
import { formatearCOP } from "@/lib/formatoDinero";
import type { ResultadoMoroso, RiesgoMora } from "@/lib/analisisMorosidad";

type FiltroVista = "todos" | "sin_pago_hoy" | "criticos";

type ResumenApi = {
  total: number;
  sin_pago_hoy: number;
  criticos: number;
  deuda_total: number;
  generado_en: string;
};

const RIESGO_STYLES: Record<
  RiesgoMora,
  { bg: string; text: string; label: string }
> = {
  critico: { bg: "bg-red-950/80", text: "text-red-300", label: "Crítico" },
  alto: { bg: "bg-orange-950/80", text: "text-orange-300", label: "Alto" },
  medio: { bg: "bg-amber-950/80", text: "text-amber-300", label: "Medio" },
  bajo: { bg: "bg-zinc-800", text: "text-zinc-400", label: "Bajo" },
};

function enlaceWhatsApp(telefono: string, texto: string): string | null {
  const digits = telefono.replace(/\D/g, "");
  if (!digits) return null;
  const conPais = digits.startsWith("57")
    ? digits
    : digits.startsWith("0")
      ? `57${digits.slice(1)}`
      : `57${digits}`;
  return `https://wa.me/${conPais}?text=${encodeURIComponent(texto)}`;
}

function formatFechaCorta(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!d) return iso;
  return `${d}/${m}/${y?.slice(2) ?? y}`;
}

function hoyIso(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function PlacasMorososPage() {
  const [morosos, setMorosos] = useState<ResultadoMoroso[]>([]);
  const [resumen, setResumen] = useState<ResumenApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroVista>("sin_pago_hoy");
  const [busqueda, setBusqueda] = useState("");
  const [validados, setValidados] = useState<Set<string>>(() => new Set());
  const [enviando, setEnviando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    setMensaje(null);
    try {
      const q = refresh ? "?refresh=1" : "";
      const res = await fetch(`/api/placas/morosos${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al cargar");
      setMorosos(data.morosos ?? []);
      setResumen(data.resumen ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    return morosos.filter((m) => {
      if (validados.has(m.placa)) return false;
      if (filtro === "sin_pago_hoy" && m.pago_hoy) return false;
      if (filtro === "criticos" && m.riesgo_mora !== "critico") return false;
      if (!q) return true;
      return (
        m.placa.toUpperCase().includes(q) ||
        m.nombre.toUpperCase().includes(q) ||
        m.cedula.includes(q)
      );
    });
  }, [morosos, filtro, busqueda, validados]);

  const marcarValidado = (placa: string) => {
    setValidados((prev) => new Set(prev).add(placa));
    setMensaje(`Placa ${placa}: validada (pagó o revisada en WhatsApp).`);
  };

  const enviarARecuperadores = async (m: ResultadoMoroso) => {
    setEnviando(m.placa);
    setMensaje(null);
    try {
      const res = await fetch("/api/placas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placa: m.placa, gps_moto: "iop gps" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo publicar");
      setValidados((prev) => new Set(prev).add(m.placa));
      setMensaje(`Placa ${m.placa} enviada al admin para asignar recuperadores.`);
    } catch (e) {
      setMensaje(
        e instanceof Error ? e.message : "Error al enviar placa",
      );
    } finally {
      setEnviando(null);
    }
  };

  const textoWhatsApp = (m: ResultadoMoroso) =>
    `Hola ${m.nombre.split(" ")[0] ?? ""}, soy del área de cobranza. ¿Confirmas si realizaste algún pago hoy ${formatFechaCorta(hoyIso())}? Placa ${m.placa}. Deuda aprox: ${formatearCOP(m.deuda_total)}. Gracias.`;

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-zinc-800 px-4 py-4">
        <h1 className="text-lg font-bold tracking-tight">
          Morosos — prioridad cobro
        </h1>
        <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
          Para recoger moto: pagos irregulares y (más de 5 días de mora o deuda
          mayor a $400.000). Antigüedad 14–280 días.
        </p>
        {resumen && !loading && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2">
              <div className="text-[10px] uppercase text-zinc-500">Morosos</div>
              <div className="text-sm font-semibold tabular-nums">
                {resumen.total}
              </div>
            </div>
            <div className="rounded-lg bg-amber-950/40 border border-amber-900/50 px-2 py-2">
              <div className="text-[10px] uppercase text-amber-600/90">
                Sin pago hoy
              </div>
              <div className="text-sm font-semibold tabular-nums text-amber-300">
                {resumen.sin_pago_hoy}
              </div>
            </div>
            <div className="rounded-lg bg-red-950/40 border border-red-900/50 px-2 py-2">
              <div className="text-[10px] uppercase text-red-400/90">
                Críticos
              </div>
              <div className="text-sm font-semibold tabular-nums text-red-300">
                {resumen.criticos}
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="shrink-0 px-4 py-2 space-y-2 border-b border-zinc-800/80">
        <input
          type="search"
          placeholder="Buscar placa, nombre o cédula…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-emerald-700"
        />
        <div className="flex gap-1.5">
          {(
            [
              ["sin_pago_hoy", "Sin pago hoy"],
              ["criticos", "Críticos"],
              ["todos", "Todos"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFiltro(key)}
              className={`flex-1 min-h-[40px] rounded-xl text-[11px] font-semibold touch-manipulation ${
                filtro === key
                  ? "bg-emerald-700 text-white"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-700"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void cargar(true)}
            disabled={loading}
            className="shrink-0 px-3 rounded-xl bg-zinc-800 border border-zinc-600 text-xs font-medium disabled:opacity-50"
            title="Actualizar análisis"
          >
            ↻
          </button>
        </div>
        {mensaje && (
          <p className="text-xs text-emerald-400/90 leading-snug">{mensaje}</p>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-3 pb-2">
        {loading && (
          <p className="text-center text-sm text-zinc-500 py-12">
            Analizando patrones de pago…
          </p>
        )}
        {error && (
          <p className="text-center text-sm text-red-400 py-8">{error}</p>
        )}
        {!loading && !error && listaFiltrada.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-12">
            No hay placas en este filtro.
            {validados.size > 0 && ` (${validados.size} validadas hoy)`}
          </p>
        )}

        <ul className="space-y-3 max-w-[414px] mx-auto">
          {listaFiltrada.map((m) => {
            const rs = RIESGO_STYLES[m.riesgo_mora];
            const wa = enlaceWhatsApp(m.telefono, textoWhatsApp(m));
            return (
              <li
                key={m.placa}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/80 overflow-hidden"
              >
                <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-base tracking-wide">
                        {m.placa}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${rs.bg} ${rs.text}`}
                      >
                        {rs.label}
                      </span>
                      {m.pago_hoy ? (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                          Pagó hoy
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/50 px-1.5 py-0.5 rounded">
                          Sin pago hoy
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-300 truncate">{m.nombre}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{m.motivo}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-amber-400 tabular-nums">
                      {formatearCOP(m.deuda_total)}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {m.dias_mora}d mora
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-3 py-2 text-[11px] text-zinc-500">
                  <span>
                    Patrón:{" "}
                    <strong className="text-zinc-300">
                      {m.frecuencia_etiqueta}
                    </strong>
                    {m.pagos_irregulares && (
                      <span className="text-amber-500/90"> · irregular</span>
                    )}
                  </span>
                  <span>
                    Último pago:{" "}
                    <strong className="text-zinc-300">
                      {formatFechaCorta(m.ultimo_pago) || "—"}
                    </strong>
                  </span>
                  <span>
                    Cada ~{m.dias_promedio_entre_pagos || "—"}d · reg.{" "}
                    {Math.round(m.regularidad_score * 100)}%
                  </span>
                  <span>
                    Tendencia:{" "}
                    <strong
                      className={
                        m.tendencia_deuda === "creciente"
                          ? "text-red-400"
                          : m.tendencia_deuda === "mejorando"
                            ? "text-emerald-400"
                            : "text-zinc-300"
                      }
                    >
                      {m.tendencia_deuda === "creciente"
                        ? "Deuda ↑"
                        : m.tendencia_deuda === "mejorando"
                          ? "Mejorando"
                          : "Estable"}
                    </strong>
                  </span>
                  <span>Cumpl. {m.cumplimiento_pct}%</span>
                  <span>Cuota {formatearCOP(m.valor_cuota)}</span>
                </div>

                <div className="flex gap-1.5 p-2 border-t border-zinc-800/80">
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 text-xs font-semibold touch-manipulation"
                    >
                      WhatsApp
                    </a>
                  ) : (
                    <span className="flex-1 min-h-[44px] flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-600 text-xs">
                      Sin teléfono
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => marcarValidado(m.placa)}
                    className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 border border-zinc-600 text-xs font-semibold text-zinc-300 touch-manipulation active:bg-zinc-700"
                  >
                    Validé pago
                  </button>
                  <button
                    type="button"
                    disabled={enviando === m.placa}
                    onClick={() => void enviarARecuperadores(m)}
                    className="flex-1 min-h-[44px] rounded-xl bg-emerald-800 border border-emerald-600 text-xs font-semibold text-white touch-manipulation disabled:opacity-50"
                  >
                    {enviando === m.placa ? "…" : "Asignar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>

      <NavFooter />
    </div>
  );
}
