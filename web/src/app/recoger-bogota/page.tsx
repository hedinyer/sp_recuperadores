"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapaRecogerBogota } from "@/components/MapaRecogerBogota";
import { NavFooter } from "@/components/NavFooter";
import { formatearCOP } from "@/lib/formatoDinero";
import type { EstadoGpsPlaca } from "@/lib/gpsEstadoPlacas";

/** Umbrales — espejo de recogerBogota.ts */
const DEUDA_MIN_RECOGER_CAMPO_COP = 450_000;
const DISTANCIA_MAX_RECOGER_KM = 30;
/** Origen por defecto (espejo de ORIGEN_RECOGER_BOGOTA; no importar lib con pg). */
const ORIGEN_DEFAULT = {
  lat: 4.667372044635534,
  lng: -74.06239794213879,
} as const;
const STORAGE_ORIGEN_KEY = "recoger-bogota-origen";
/** Poll GPS en vivo (mismo ritmo que IOP individual). */
const POLL_GPS_VIVO_MS = 3_000;

type VistaTab = "recoger" | "llamar";

type OrigenGps = { lat: number; lng: number };

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

function distanciaKm(a: OrigenGps, b: OrigenGps): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatearOrigenInput(o: OrigenGps): string {
  return `${o.lat}, ${o.lng}`;
}

/** Acepta "7.067708382493969, -73.84310297441053" */
function parseOrigenCoords(raw: string): OrigenGps | null {
  const m = String(raw)
    .trim()
    .match(
      /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/,
    );
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }
  return { lat, lng };
}

function leerOrigenGuardado(): OrigenGps {
  try {
    const raw = localStorage.getItem(STORAGE_ORIGEN_KEY);
    if (!raw) return { ...ORIGEN_DEFAULT };
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    ) {
      return { lat, lng };
    }
  } catch {
    // ponytail: fallback al origen por defecto
  }
  return { ...ORIGEN_DEFAULT };
}

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

function enlaceSeguirPlaca(placa: string): string {
  if (typeof window === "undefined") return `/seguir/${placa}`;
  return `${window.location.origin}/seguir/${encodeURIComponent(placa)}`;
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
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [actualizadoEnVivo, setActualizadoEnVivo] = useState<string | null>(
    null,
  );
  const [origen, setOrigen] = useState<OrigenGps>({ ...ORIGEN_DEFAULT });
  const [coordsInput, setCoordsInput] = useState(
    formatearOrigenInput(ORIGEN_DEFAULT),
  );
  const [origenError, setOrigenError] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    const guardado = leerOrigenGuardado();
    setOrigen(guardado);
    setCoordsInput(formatearOrigenInput(guardado));
  }, []);

  const aplicarOrigen = useCallback(() => {
    const next = parseOrigenCoords(coordsInput);
    if (!next) {
      setOrigenError("Usa el formato: 7.067708382493969, -73.84310297441053");
      return;
    }
    setOrigen(next);
    setCoordsInput(formatearOrigenInput(next));
    setOrigenError(null);
    try {
      localStorage.setItem(STORAGE_ORIGEN_KEY, JSON.stringify(next));
    } catch {
      // ponytail: sin persistencia si localStorage falla
    }
  }, [coordsInput]);

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

  const placasLiveRef = useRef<string[]>([]);
  placasLiveRef.current = motos
    .filter((m) => m.deuda_total >= DEUDA_MIN_RECOGER_CAMPO_COP)
    .map((m) => m.placa);

  // GPS en vivo cada 3s (solo pestaña Recoger).
  useEffect(() => {
    if (vista !== "recoger") return;
    let cancelled = false;
    let enCurso = false;

    const tick = async () => {
      if (cancelled || enCurso) return;
      const placas = placasLiveRef.current;
      if (!placas.length) return;
      enCurso = true;
      try {
        const res = await fetch("/api/placas/recoger-bogota/live", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placas }),
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        const porPlaca = new Map<
          string,
          {
            lat: number | null;
            lng: number | null;
            distancia_km: number | null;
            gps: EstadoGpsPlaca;
          }
        >();
        for (const p of data.posiciones ?? []) {
          porPlaca.set(String(p.placa).toUpperCase(), p);
        }

        setMotos((prev) =>
          prev.map((m) => {
            const live = porPlaca.get(m.placa.toUpperCase());
            if (!live) return m;
            return {
              ...m,
              lat: live.lat,
              lng: live.lng,
              // distancia se recalcula en cliente según el origen elegido
              distancia_km: live.distancia_km,
              gps: live.gps,
            };
          }),
        );
        setActualizadoEnVivo(
          new Date().toLocaleTimeString("es-CO", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      } catch {
        // silencio: el siguiente tick reintenta
      } finally {
        enCurso = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_GPS_VIVO_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [vista]);

  const { paraRecoger, paraLlamar } = useMemo(() => {
    const recoger: MotoRecogerBogota[] = [];
    const llamar: MotoRecogerBogota[] = [];
    for (const m of motos) {
      const dist =
        m.lat != null && m.lng != null
          ? distanciaKm(origen, { lat: m.lat, lng: m.lng })
          : null;
      const conDist = { ...m, distancia_km: dist };

      if (m.deuda_total >= DEUDA_MIN_RECOGER_CAMPO_COP) {
        // Solo GPS activo (online/ack en DS Track o IOP) — no última posición offline.
        if (
          m.gps.funcional &&
          dist != null &&
          dist <= DISTANCIA_MAX_RECOGER_KM
        ) {
          recoger.push(conDist);
        }
      } else {
        llamar.push(conDist);
      }
    }
    recoger.sort((a, b) => {
      const da = a.distancia_km ?? Infinity;
      const db = b.distancia_km ?? Infinity;
      if (da !== db) return da - db;
      // En línea primero a igual distancia.
      return Number(b.gps.funcional) - Number(a.gps.funcional);
    });
    return { paraRecoger: recoger, paraLlamar: llamar };
  }, [motos, origen]);

  const puntosMapa = useMemo(
    () =>
      paraRecoger
        .filter((m) => m.lat != null && m.lng != null)
        .map((m) => ({
          placa: m.placa,
          lat: m.lat!,
          lng: m.lng!,
          deuda_total: m.deuda_total,
          distancia_km: m.distancia_km,
          online: Boolean(m.gps.funcional),
        })),
    [paraRecoger],
  );

  const lista = useMemo(() => {
    const base = vista === "recoger" ? paraRecoger : paraLlamar;
    const q = busqueda.trim().toUpperCase();
    if (!q) return base;
    return base.filter(
      (m) =>
        m.placa.toUpperCase().includes(q) ||
        m.nombre.toUpperCase().includes(q) ||
        m.cedula.includes(q) ||
        digitosTelefono(m.telefono).includes(q.replace(/\D/g, "")),
    );
  }, [vista, paraRecoger, paraLlamar, busqueda]);

  const seleccionarPlaca = useCallback((placa: string) => {
    setSeleccionada(placa);
    const el = itemRefs.current.get(placa);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const compartirSeguimiento = useCallback(async (placa: string) => {
    const url = enlaceSeguirPlaca(placa);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: `Seguir ${placa}`,
          text: `Sigue la placa ${placa} en vivo`,
          url,
        });
        return;
      }
    } catch (e) {
      // Usuario canceló el share nativo → caer a copiar
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopiado(placa);
      window.setTimeout(() => {
        setLinkCopiado((prev) => (prev === placa ? null : prev));
      }, 2000);
    } catch {
      window.prompt("Copia este link:", url);
    }
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="shrink-0 px-4 pt-3 pb-2 border-b border-zinc-800/80 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">
              Recoger Bogotá
            </h1>
            <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
              Recoger: ≥ $450k, GPS activo y ≤ {DISTANCIA_MAX_RECOGER_KM} km ·
              Llamar: $200k–$450k
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void cargar(true).finally(() => setLoading(false));
            }}
            disabled={loading}
            aria-label="Actualizar lista y mapa"
            className="shrink-0 px-3 min-h-[44px] min-w-[44px] rounded-xl bg-zinc-800 border border-zinc-600 text-xs font-medium disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            title="Actualizar"
          >
            ↻
          </button>
        </div>

        <div
          className="grid grid-cols-2 gap-1.5"
          role="tablist"
          aria-label="Tipo de lista"
        >
          <button
            type="button"
            role="tab"
            aria-selected={vista === "recoger"}
            onClick={() => setVista("recoger")}
            className={`rounded-xl border px-2 py-2 text-center min-h-[52px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 ${
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
            <p className="text-[9px] text-zinc-500">
              ≥ $450k · GPS activo · ≤ {DISTANCIA_MAX_RECOGER_KM} km
            </p>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vista === "llamar"}
            onClick={() => setVista("llamar")}
            className={`rounded-xl border px-2 py-2 text-center min-h-[52px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
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
            <p className="text-[9px] text-zinc-500">&lt; $450k</p>
          </button>
        </div>

        {vista === "recoger" && (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              aplicarOrigen();
            }}
          >
            <label
              htmlFor="origen-coords"
              className="block text-[10px] font-medium text-zinc-400"
            >
              Coordenadas GPS · radio {DISTANCIA_MAX_RECOGER_KM} km
            </label>
            <div className="flex gap-1.5">
              <input
                id="origen-coords"
                type="text"
                inputMode="decimal"
                value={coordsInput}
                onChange={(e) => {
                  setCoordsInput(e.target.value);
                  setOrigenError(null);
                }}
                placeholder="7.067708382493969, -73.84310297441053"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 min-h-[40px] min-w-0 rounded-lg bg-zinc-900 border border-zinc-700 px-2.5 text-xs tabular-nums text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
              />
              <button
                type="submit"
                className="shrink-0 min-h-[40px] px-3 rounded-lg bg-sky-950/70 border border-sky-700 text-[11px] font-semibold text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              >
                Aplicar
              </button>
            </div>
            {origenError ? (
              <p className="text-[10px] text-rose-400" role="alert">
                {origenError}
              </p>
            ) : null}
          </form>
        )}

        <p className="text-[10px] text-zinc-500 tabular-nums" role="status">
          {vista === "recoger"
            ? `${paraRecoger.length} en mapa`
            : `Total ${resumen?.total ?? "—"}`}
          {actualizadoEnVivo && vista === "recoger"
            ? ` · en vivo ${actualizadoEnVivo}`
            : null}
          {resumen && vista === "llamar"
            ? ` · deuda ${formatearCOP(resumen.deuda_total)}`
            : null}
        </p>

        <div>
          <label htmlFor="buscar-recoger-bogota" className="sr-only">
            Buscar placa, nombre o teléfono
          </label>
          <input
            id="buscar-recoger-bogota"
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar placa, nombre, teléfono…"
            autoComplete="off"
            className="w-full min-h-[44px] rounded-xl bg-zinc-900 border border-zinc-700 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          />
        </div>
      </header>

      {vista === "recoger" && !loading && !error && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden md:flex-row">
          <MapaRecogerBogota
            motos={puntosMapa}
            origen={origen}
            radioKm={DISTANCIA_MAX_RECOGER_KM}
            seleccionada={seleccionada}
            onSeleccionar={seleccionarPlaca}
          />

          <main
            id="lista-recoger-bogota"
            className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-2 md:w-[min(100%,420px)] md:shrink-0 md:border-l md:border-zinc-800"
            aria-label="Lista de motos para recoger"
          >
            {renderLista()}
          </main>
        </div>
      )}

      {(vista === "llamar" || loading || error) && (
        <main
          id="lista-recoger-bogota"
          className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-2"
          aria-label={
            vista === "recoger" ? "Lista de motos para recoger" : "Lista para llamar"
          }
        >
          {renderLista()}
        </main>
      )}
    </div>
  );

  function renderLista() {
    return (
      <>
        {loading && (
          <p className="text-center text-sm text-zinc-500 py-12" role="status">
            Cargando motos y GPS…
          </p>
        )}
        {error && (
          <p className="text-center text-sm text-red-400 py-8" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && lista.length === 0 && (
          <p className="text-center text-sm text-zinc-500 py-12">
            {vista === "recoger"
              ? `No hay motos ≥ $450.000 con GPS activo a ≤ ${DISTANCIA_MAX_RECOGER_KM} km del origen.`
              : "No hay motos entre $200.000 y $450.000."}
          </p>
        )}
        {!loading && !error && lista.length > 0 && (
          <ul className="flex flex-col gap-2">
            {lista.map((m, i) => {
              const telHref = enlaceTel(m.telefono);
              const activa = seleccionada === m.placa;
              return (
                <li
                  key={m.placa}
                  ref={(el) => {
                    if (el) itemRefs.current.set(m.placa, el);
                    else itemRefs.current.delete(m.placa);
                  }}
                  className={`rounded-2xl border px-3.5 py-3 ${
                    activa
                      ? "border-rose-600 bg-rose-950/30"
                      : "border-zinc-800 bg-zinc-900/50"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-[11px] font-bold text-zinc-600 w-5 tabular-nums pt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        {vista === "recoger" ? (
                          <button
                            type="button"
                            onClick={() => seleccionarPlaca(m.placa)}
                            className="text-base font-bold tracking-wide text-white text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 rounded"
                          >
                            {m.placa}
                          </button>
                        ) : (
                          <p className="text-base font-bold tracking-wide text-white">
                            {m.placa}
                          </p>
                        )}
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
                              className="text-base font-bold tabular-nums tracking-wide text-sky-300 hover:text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 rounded"
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
                              className="text-[11px] font-semibold text-sky-200 bg-sky-950/60 px-2 py-1 min-h-[44px] inline-flex items-center rounded-lg border border-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
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
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => void compartirSeguimiento(m.placa)}
                            className="inline-flex min-h-[44px] items-center px-2.5 rounded-lg border border-sky-800 bg-sky-950/50 text-[11px] font-semibold text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                          >
                            {linkCopiado === m.placa
                              ? "Link copiado"
                              : "Compartir seguimiento"}
                          </button>
                          <a
                            href={enlaceSeguirPlaca(m.placa)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center text-[11px] font-medium text-sky-300 hover:text-sky-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 rounded"
                          >
                            Abrir seguimiento →
                          </a>
                          <a
                            href={enlaceMaps(m.lat, m.lng)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center text-[11px] font-medium text-emerald-400 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 rounded"
                          >
                            Maps →
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }
}

export default function RecogerBogotaPage() {
  return (
    <div className="flex flex-col h-dvh max-w-[414px] md:max-w-none mx-auto bg-zinc-950 text-zinc-100 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ContenidoRecogerBogota />
      </div>
      <NavFooter />
    </div>
  );
}
