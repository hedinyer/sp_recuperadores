"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { NavFooter } from "@/components/NavFooter";
import { formatearCOP } from "@/lib/formatoDinero";
import type { ResultadoMoroso, RiesgoMora } from "@/lib/analisisMorosidad";
import type { ResultadoAtraso } from "@/lib/atrasosFromDb";

type VistaTab = "morosos" | "atrasos";
type FiltroVista = "todos" | "sin_pago_hoy" | "criticos";

/** Mínimo de placas visibles en cola de prioridad cobro. */
const COLA_MIN_VISIBLE = 12;

function normalizarPlacaKey(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

type ResumenMorososApi = {
  total: number;
  sin_pago_hoy: number;
  criticos: number;
  deuda_total: number;
  generado_en: string;
};

type ResumenAtrasosApi = {
  total: number;
  sin_pago_hoy: number;
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

function filtrarMorosos(
  lista: ResultadoMoroso[],
  busqueda: string,
  validados: Set<string>,
  filtro: FiltroVista,
): ResultadoMoroso[] {
  const q = busqueda.trim().toUpperCase();
  return lista.filter((m) => {
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
}

/** Reporte de atrasos: solo búsqueda; no oculta por pago hoy ni validados. */
function filtrarAtrasos(
  lista: ResultadoAtraso[],
  busqueda: string,
): ResultadoAtraso[] {
  const q = busqueda.trim().toUpperCase();
  if (!q) return lista;
  return lista.filter(
    (a) =>
      a.placa.toUpperCase().includes(q) ||
      a.nombre.toUpperCase().includes(q) ||
      a.cedula.includes(q),
  );
}

export default function PlacasMorososPage() {
  const [vista, setVista] = useState<VistaTab>("atrasos");
  const [morosos, setMorosos] = useState<ResultadoMoroso[]>([]);
  const [atrasos, setAtrasos] = useState<ResultadoAtraso[]>([]);
  const [resumenMorosos, setResumenMorosos] = useState<ResumenMorososApi | null>(
    null,
  );
  const [resumenAtrasos, setResumenAtrasos] = useState<ResumenAtrasosApi | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroVista>("sin_pago_hoy");
  const [busqueda, setBusqueda] = useState("");
  const [validados, setValidados] = useState<Set<string>>(() => new Set());
  const [asignadasSesion, setAsignadasSesion] = useState<Set<string>>(
    () => new Set(),
  );
  const [placasEnColaAdmin, setPlacasEnColaAdmin] = useState<Set<string>>(
    () => new Set(),
  );
  const [enviando, setEnviando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargarMorosos = useCallback(async (refresh = false) => {
    const q = refresh ? "?refresh=1" : "";
    const [resMorosos, resPlacas] = await Promise.all([
      fetch(`/api/placas/morosos${q}`),
      fetch("/api/placas"),
    ]);
    const data = await resMorosos.json();
    if (!resMorosos.ok) throw new Error(data.error ?? "Error al cargar morosos");
    setMorosos(data.morosos ?? []);
    setResumenMorosos(data.resumen ?? null);
    const dataPlacas = await resPlacas.json();
    if (resPlacas.ok) {
      const hoy = new Set<string>();
      for (const p of dataPlacas.placas ?? []) {
        const status = String(p.status ?? "").toLowerCase();
        if (status === "pendiente" || status === "asignada") {
          hoy.add(normalizarPlacaKey(String(p.placa ?? "")));
        }
      }
      setPlacasEnColaAdmin(hoy);
    }
  }, []);

  const cargarAtrasos = useCallback(async (refresh = false) => {
    const q = refresh ? "?refresh=1" : "";
    const res = await fetch(`/api/placas/atrasos${q}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Error al cargar atrasos");
    setAtrasos(data.atrasos ?? []);
    setResumenAtrasos(data.resumen ?? null);
  }, []);

  const cargar = useCallback(
    async (refresh = false) => {
      setLoading(true);
      setError(null);
      setMensaje(null);
      try {
        if (vista === "morosos") {
          await cargarMorosos(refresh);
        } else {
          await cargarAtrasos(refresh);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    },
    [vista, cargarMorosos, cargarAtrasos],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const excluidasPrioridad = useMemo(() => {
    const s = new Set<string>();
    for (const p of asignadasSesion) s.add(normalizarPlacaKey(p));
    for (const p of placasEnColaAdmin) s.add(p);
    for (const p of validados) s.add(normalizarPlacaKey(p));
    return s;
  }, [asignadasSesion, placasEnColaAdmin, validados]);

  const colaPrioridad = useMemo(
    () =>
      morosos.filter((m) => !excluidasPrioridad.has(normalizarPlacaKey(m.placa))),
    [morosos, excluidasPrioridad],
  );

  const listaMorosos = useMemo(
    () => filtrarMorosos(colaPrioridad, busqueda, new Set(), filtro),
    [colaPrioridad, filtro, busqueda],
  );

  const siguienteEnCola = useMemo(() => {
    const visibles = new Set(
      listaMorosos.map((m) => normalizarPlacaKey(m.placa)),
    );
    return colaPrioridad.find(
      (m) => !visibles.has(normalizarPlacaKey(m.placa)),
    );
  }, [colaPrioridad, listaMorosos]);

  const listaAtrasos = useMemo(
    () => filtrarAtrasos(atrasos, busqueda),
    [atrasos, busqueda],
  );

  const marcarValidado = (placa: string) => {
    setValidados((prev) => new Set(prev).add(placa));
    setMensaje(`Placa ${placa}: validada (pagó o revisada en WhatsApp).`);
  };

  const enviarARecuperadores = async (m: ResultadoMoroso) => {
    const placaKey = normalizarPlacaKey(m.placa);
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
      const nuevaAsignadas = new Set(asignadasSesion).add(placaKey);
      const nuevaAdmin = new Set(placasEnColaAdmin).add(placaKey);
      const excluidas = new Set<string>();
      for (const p of nuevaAsignadas) excluidas.add(p);
      for (const p of nuevaAdmin) excluidas.add(p);
      for (const p of validados) excluidas.add(normalizarPlacaKey(p));
      const disponibles = morosos.filter(
        (x) => !excluidas.has(normalizarPlacaKey(x.placa)),
      );
      setAsignadasSesion(nuevaAsignadas);
      setPlacasEnColaAdmin(nuevaAdmin);
      const sig = disponibles[0];
      setMensaje(
        sig
          ? `Placa ${m.placa} publicada. Siguiente: ${sig.placa} (${disponibles.length} en cola).`
          : `Placa ${m.placa} publicada. Recarga ↻ si necesitas más candidatos.`,
      );
    } catch (e) {
      setMensaje(
        e instanceof Error ? e.message : "Error al enviar placa",
      );
    } finally {
      setEnviando(null);
    }
  };

  const textoWhatsApp = (nombre: string, placa: string, deuda: number) =>
    `Hola ${nombre.split(" ")[0] ?? ""}, soy del área de cobranza. ¿Confirmas si realizaste algún pago hoy ${formatFechaCorta(hoyIso())}? Placa ${placa}. Deuda aprox: ${formatearCOP(deuda)}. Gracias.`;

  const listaActual = vista === "morosos" ? listaMorosos : listaAtrasos;
  const resumen = vista === "morosos" ? resumenMorosos : resumenAtrasos;

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-950 text-zinc-100">
      <header className="shrink-0 border-b border-zinc-800 px-4 py-4">
        <h1 className="text-lg font-bold tracking-tight">Morosos y atrasos</h1>

        <div className="mt-3 flex gap-1.5 rounded-xl bg-zinc-900 p-1 border border-zinc-800">
          <button
            type="button"
            onClick={() => setVista("morosos")}
            className={`flex-1 min-h-[40px] rounded-lg text-xs font-semibold touch-manipulation ${
              vista === "morosos"
                ? "bg-emerald-700 text-white"
                : "text-zinc-400"
            }`}
          >
            Prioridad cobro
          </button>
          <button
            type="button"
            onClick={() => setVista("atrasos")}
            className={`flex-1 min-h-[40px] rounded-lg text-xs font-semibold touch-manipulation ${
              vista === "atrasos"
                ? "bg-sky-700 text-white"
                : "text-zinc-400"
            }`}
          >
            Reporte atrasos
          </button>
        </div>

        <p className="mt-2 text-xs text-zinc-500 leading-relaxed">
          {vista === "morosos" ? (
            <>
              Recoger moto: más de 5 cuotas en mora y deuda mayor a $250.000, o pago
              diario sin abonar deuda. Al asignar se repone la cola automáticamente.
            </>
          ) : (
            <>
              Todos los clientes con deuda pendiente (extracto), hayan pagado
              hoy o no. Lista completa sin ocultar por pago del día.
            </>
          )}
        </p>

        {resumen && !loading && (
          <div
            className={`mt-3 grid gap-2 text-center ${
              vista === "morosos" ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 px-2 py-2">
              <div className="text-[10px] uppercase text-zinc-500">
                {vista === "morosos" ? "Morosos" : "Con deuda"}
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {resumen.total}
              </div>
            </div>
            <div className="rounded-lg bg-amber-950/40 border border-amber-900/50 px-2 py-2">
              <div className="text-[10px] uppercase text-amber-600/90">
                {vista === "atrasos" ? "Pagaron hoy" : "Sin pago hoy"}
              </div>
              <div className="text-sm font-semibold tabular-nums text-amber-300">
                {vista === "atrasos"
                  ? resumen.total - resumen.sin_pago_hoy
                  : resumen.sin_pago_hoy}
              </div>
            </div>
            {vista === "morosos" && resumenMorosos && (
              <div className="rounded-lg bg-red-950/40 border border-red-900/50 px-2 py-2">
                <div className="text-[10px] uppercase text-red-400/90">
                  Críticos
                </div>
                <div className="text-sm font-semibold tabular-nums text-red-300">
                  {resumenMorosos.criticos}
                </div>
              </div>
            )}
          </div>
        )}
        {resumen && !loading && (
          <p className="mt-2 text-[11px] text-zinc-600 text-center tabular-nums">
            Deuda total: {formatearCOP(resumen.deuda_total)}
          </p>
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
        {vista === "morosos" ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-zinc-500 leading-snug">
              Cola: {listaMorosos.length} visibles · {colaPrioridad.length}{" "}
              disponibles
              {colaPrioridad.length < COLA_MIN_VISIBLE &&
                colaPrioridad.length > 0 &&
                " (pocas en cola, recarga ↻)"}
              {siguienteEnCola &&
                listaMorosos.length < COLA_MIN_VISIBLE &&
                ` · +${colaPrioridad.length - listaMorosos.length} en reserva`}
            </p>
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
              title="Actualizar datos"
            >
              ↻
            </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5 items-center">
            <p className="flex-1 text-[11px] text-zinc-500 leading-snug">
              Mostrando {listaAtrasos.length} de {atrasos.length} con deuda
            </p>
            <button
              type="button"
              onClick={() => void cargar(true)}
              disabled={loading}
              className="shrink-0 px-3 min-h-[40px] rounded-xl bg-zinc-800 border border-zinc-600 text-xs font-medium disabled:opacity-50"
              title="Actualizar datos"
            >
              ↻
            </button>
          </div>
        )}
        {mensaje && (
          <p className="text-xs text-emerald-400/90 leading-snug">{mensaje}</p>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-3 pb-2">
        {loading && (
          <p className="text-center text-sm text-zinc-500 py-12">
            {vista === "morosos"
              ? "Analizando patrones de pago…"
              : "Generando reporte de atrasos…"}
          </p>
        )}
        {error && (
          <p className="text-center text-sm text-red-400 py-8">{error}</p>
        )}
        {!loading && !error && listaActual.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-12">
            {vista === "atrasos"
              ? "No hay clientes con deuda pendiente."
              : "No hay placas en este filtro."}
            {vista === "morosos" &&
              validados.size > 0 &&
              ` (${validados.size} validadas hoy)`}
          </p>
        )}

        <ul className="space-y-3 max-w-[414px] mx-auto">
          {vista === "morosos" &&
            listaMorosos.map((m) => {
              const rs = RIESGO_STYLES[m.riesgo_mora];
              const wa = enlaceWhatsApp(
                m.telefono,
                textoWhatsApp(m.nombre, m.placa, m.deuda_total),
              );
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
                        {m.pago_diario_sin_abono && (
                          <span className="text-[10px] font-semibold text-orange-300 bg-orange-950/60 px-1.5 py-0.5 rounded">
                            Diario sin abono
                          </span>
                        )}
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
                      Cuotas mora:{" "}
                      <strong className="text-zinc-300">
                        {m.cuotas_pendientes}
                      </strong>
                    </span>
                    <span>
                      Patrón {m.frecuencia_etiqueta} · cumpl. {m.cumplimiento_pct}%
                    </span>
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

          {vista === "atrasos" &&
            listaAtrasos.map((a) => {
              const wa = enlaceWhatsApp(
                a.telefono,
                textoWhatsApp(a.nombre, a.placa, a.deuda_total),
              );
              const revisado = validados.has(a.placa);
              return (
                <li
                  key={a.placa}
                  className={`rounded-2xl border bg-zinc-900/80 overflow-hidden ${
                    revisado ? "border-zinc-700/60 opacity-90" : "border-zinc-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-1">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-base tracking-wide">
                          {a.placa}
                        </span>
                        {revisado && (
                          <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                            Revisado
                          </span>
                        )}
                        {a.pago_hoy ? (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">
                            Pagó hoy
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/50 px-1.5 py-0.5 rounded">
                            Sin pago hoy
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-300 truncate">{a.nombre}</p>
                      {a.visitador && (
                        <p className="text-[11px] text-zinc-500 truncate">
                          {a.visitador}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-sky-400 tabular-nums">
                        {formatearCOP(a.deuda_total)}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {a.dias_mora}d mora
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 px-3 py-2 text-[11px] text-zinc-500">
                    <span>
                      Último pago:{" "}
                      <strong className="text-zinc-300">
                        {formatFechaCorta(a.ultimo_pago) || "—"}
                      </strong>
                    </span>
                    <span>
                      Cuotas pend.:{" "}
                      <strong className="text-zinc-300">
                        {a.cuotas_pendientes}
                      </strong>
                    </span>
                    <span>Cumpl. {a.cumplimiento_pct}%</span>
                    <span>Cuota {formatearCOP(a.valor_cuota)}</span>
                    <span>
                      Pagado:{" "}
                      <strong className="text-zinc-300">
                        {formatearCOP(a.total_pagado)}
                      </strong>
                    </span>
                    <span>
                      Inicio:{" "}
                      <strong className="text-zinc-300">
                        {formatFechaCorta(a.fecha_inicio)}
                      </strong>
                    </span>
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
                      onClick={() => marcarValidado(a.placa)}
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 border border-zinc-600 text-xs font-semibold text-zinc-300 touch-manipulation active:bg-zinc-700"
                    >
                      Validé pago
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
