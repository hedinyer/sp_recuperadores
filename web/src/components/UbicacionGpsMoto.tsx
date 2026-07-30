"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MapaGpsEnVivo, type PuntoRutaGps } from "@/components/MapaGpsEnVivo";
import { enlaceGoogleMaps } from "@/lib/geolocation";
import { etiquetaEstadoGps, etiquetaProveedorGps } from "@/lib/gpsMoto";
import {
  etiquetaIntervaloPollGps,
  intervaloPollGpsEnVivo,
  type UbicacionGpsMoto as UbicacionGps,
} from "@/lib/ubicacionGps";

type UbicacionGpsMotoProps = {
  placa: string;
  gps: UbicacionGps;
  /** Valor en tabla placas: "iop gps" | "ds track" (legacy: "system track"). */
  gpsMoto?: string | null;
  /** Solo consulta GPS en vivo mientras el panel está abierto. */
  activo: boolean;
  onActualizar?: () => void;
};

function mismoPunto(a: PuntoRutaGps, b: PuntoRutaGps): boolean {
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001;
}

function agregarPuntoRuta(prev: PuntoRutaGps[], punto: PuntoRutaGps): PuntoRutaGps[] {
  const ultimo = prev[prev.length - 1];
  if (ultimo && mismoPunto(ultimo, punto)) return prev;
  const next = [...prev, punto];
  return next.length > 40 ? next.slice(-40) : next;
}

export function UbicacionGpsMoto({
  placa,
  gps: gpsInicial,
  gpsMoto,
  activo,
  onActualizar,
}: UbicacionGpsMotoProps) {
  const [gps, setGps] = useState(gpsInicial);
  const [ruta, setRuta] = useState<PuntoRutaGps[]>([
    { lat: gpsInicial.lat, lng: gpsInicial.lng },
  ]);
  const [enVivo, setEnVivo] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [errorLive, setErrorLive] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<"bloquear" | "desbloquear" | null>(
    null,
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deviceIdRef = useRef(gpsInicial.deviceId);
  const fetchEnCursoRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const intervaloPollMs = intervaloPollGpsEnVivo(gps.proveedor);

  useEffect(() => {
    deviceIdRef.current = gpsInicial.deviceId;
    setGps(gpsInicial);
    setRuta([{ lat: gpsInicial.lat, lng: gpsInicial.lng }]);
    setErrorLive(null);
  }, [gpsInicial]);

  const refrescarPosicion = useCallback(async () => {
    if (!activo || fetchEnCursoRef.current) return;
    fetchEnCursoRef.current = true;
    setActualizando(true);
    try {
      const params = new URLSearchParams({
        placa,
        device_id: String(deviceIdRef.current),
      });
      if (gpsInicial.imei) params.set("imei", gpsInicial.imei);
      if (gpsMoto) params.set("gps_moto", gpsMoto);
      const res = await fetch(`/api/gps/live?${params}`, {
        cache: "no-store",
        signal: abortRef.current?.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorLive(data.error ?? "No se pudo actualizar el GPS");
        return;
      }
      if (data.gps) {
        const nuevo = data.gps as UbicacionGps;
        deviceIdRef.current = nuevo.deviceId;
        setGps(nuevo);
        setRuta((prev) =>
          agregarPuntoRuta(prev, { lat: nuevo.lat, lng: nuevo.lng }),
        );
        setErrorLive(null);
      } else if (data.mensaje) {
        setErrorLive(String(data.mensaje));
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setErrorLive("Sin conexión al actualizar ubicación");
    } finally {
      fetchEnCursoRef.current = false;
      setActualizando(false);
    }
  }, [activo, placa, gpsMoto, gpsInicial.imei]);

  useEffect(() => {
    if (!activo || !enVivo) {
      abortRef.current?.abort();
      abortRef.current = null;
      fetchEnCursoRef.current = false;
      setActualizando(false);
      return;
    }

    abortRef.current = new AbortController();
    void refrescarPosicion();
    const id = window.setInterval(() => void refrescarPosicion(), intervaloPollMs);

    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
      abortRef.current = null;
      fetchEnCursoRef.current = false;
    };
  }, [activo, enVivo, refrescarPosicion, intervaloPollMs]);

  const mapsUrl = enlaceGoogleMaps(gps.coords);

  const enviarComando = useCallback(
    async (accion: "bloquear" | "desbloquear") => {
      const verbo = accion === "bloquear" ? "APAGAR" : "PRENDER";
      const ok = window.confirm(
        `¿Confirmas ${verbo} la moto ${placa.toUpperCase()} vía GPS?\n\n` +
          `Dispositivo: ${gps.nombreDispositivo}`,
      );
      if (!ok) return;

      setEnviando(accion);
      setMensaje(null);
      setError(null);
      try {
        const res = await fetch("/api/gps/comando", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placa, accion }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "No se pudo enviar el comando");
          return;
        }
        setMensaje(data.mensaje ?? "Comando enviado");
        onActualizar?.();
        void refrescarPosicion();
      } catch {
        setError("Sin conexión al enviar el comando");
      } finally {
        setEnviando(null);
      }
    },
    [gps.nombreDispositivo, gpsMoto, onActualizar, placa, refrescarPosicion],
  );

  return (
    <section className="px-4 py-3.5 border-b border-zinc-800 bg-emerald-950/20">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/90">
          Ubicación GPS — {etiquetaProveedorGps(gpsInicial.proveedor)}
        </h2>
        <div className="flex items-center gap-2">
          {enVivo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/90 border border-emerald-700/50 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
              <span
                className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${
                  actualizando ? "animate-pulse" : "animate-ping"
                }`}
              />
              En vivo
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setEnVivo((v) => !v)}
            className="text-[10px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-300"
          >
            {enVivo ? "Pausar" : "Reanudar"}
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900">
        <MapaGpsEnVivo
          gps={gps}
          ruta={ruta}
          seguimientoActivo={activo && enVivo}
          proveedor={gps.proveedor}
        />
      </div>

      <div className="flex flex-wrap gap-2 mt-3 mb-2">
        <span className="inline-flex items-center rounded-full bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 text-xs font-medium text-emerald-200">
          {etiquetaEstadoGps(gps.online)}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${
            gps.speed > 0
              ? "bg-amber-950/80 border-amber-800/60 text-amber-200"
              : "bg-zinc-800/90 border-zinc-700 text-zinc-300"
          }`}
        >
          {Math.round(gps.speed)} km/h
        </span>
        <span className="inline-flex items-center rounded-full bg-zinc-800/90 border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 tabular-nums">
          {Math.round(gps.course)}°
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium border ${
            gps.bloqueado
              ? "bg-rose-950/80 border-rose-800/60 text-rose-200"
              : "bg-sky-950/80 border-sky-800/60 text-sky-200"
          }`}
        >
          Motor {gps.bloqueado ? "bloqueado" : "libre"}
        </span>
      </div>

      <p
        className="text-[11px] text-zinc-500 truncate"
        title={gps.nombreDispositivo}
      >
        GPS: {gps.nombreDispositivo}
      </p>
      <p className="text-xs text-zinc-500 mt-1">
        Última actualización:{" "}
        <span className="text-zinc-300 tabular-nums">{gps.time}</span>
        {enVivo ? (
          <span className="text-zinc-600">
            {" "}
            · cada {etiquetaIntervaloPollGps(gps.proveedor)}
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-xs text-zinc-500 tabular-nums">
        {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
      </p>
      {ruta.length > 1 ? (
        <p className="mt-0.5 text-[10px] text-zinc-600">
          Rastro en sesión: {ruta.length} puntos
        </p>
      ) : null}

      {errorLive ? (
        <p className="mt-2 text-xs text-amber-300 leading-snug">{errorLive}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={!!enviando}
          onClick={() => enviarComando("bloquear")}
          className="min-h-[46px] rounded-xl border border-rose-700/70 bg-rose-950/50 text-sm font-semibold text-rose-100 active:scale-[0.98] transition-transform touch-manipulation disabled:opacity-50"
        >
          {enviando === "bloquear" ? "Enviando…" : "Apagar moto"}
        </button>
        <button
          type="button"
          disabled={!!enviando}
          onClick={() => enviarComando("desbloquear")}
          className="min-h-[46px] rounded-xl border border-emerald-700/70 bg-emerald-950/50 text-sm font-semibold text-emerald-100 active:scale-[0.98] transition-transform touch-manipulation disabled:opacity-50"
        >
          {enviando === "desbloquear" ? "Enviando…" : "Prender moto"}
        </button>
      </div>

      {mensaje ? (
        <p className="mt-2 text-xs text-emerald-300 leading-snug">{mensaje}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-rose-300 leading-snug">{error}</p>
      ) : null}

      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-2 min-h-[46px] w-full rounded-xl border border-emerald-700/60 bg-emerald-900/30 text-sm font-semibold text-emerald-100 active:scale-[0.98] transition-transform touch-manipulation"
      >
        <svg
          aria-hidden
          className="w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        Abrir en Google Maps
      </a>
    </section>
  );
}

export function AvisoGpsPendiente({ mensaje }: { mensaje: string }) {
  return (
    <section className="px-4 py-3.5 border-b border-zinc-800 bg-amber-950/20">
      <h2 className="text-[10px] font-medium uppercase tracking-wider text-amber-400/90 mb-1.5">
        GPS moto
      </h2>
      <p className="text-sm text-amber-100/90 leading-snug">{mensaje}</p>
    </section>
  );
}
