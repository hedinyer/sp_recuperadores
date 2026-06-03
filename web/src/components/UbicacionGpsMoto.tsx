"use client";

import { useCallback, useState } from "react";

import { enlaceGoogleMaps } from "@/lib/geolocation";
import {
  enlaceMapaEmbebido,
  etiquetaEstadoGps,
  type UbicacionGpsMoto,
} from "@/lib/systemTrackGps";

type UbicacionGpsMotoProps = {
  placa: string;
  gps: UbicacionGpsMoto;
  onActualizar?: () => void;
};

export function UbicacionGpsMoto({
  placa,
  gps,
  onActualizar,
}: UbicacionGpsMotoProps) {
  const mapsUrl = enlaceGoogleMaps(gps.coords);
  const embedUrl = enlaceMapaEmbebido(gps);
  const [enviando, setEnviando] = useState<"bloquear" | "desbloquear" | null>(
    null,
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      } catch {
        setError("Sin conexión al enviar el comando");
      } finally {
        setEnviando(null);
      }
    },
    [gps.nombreDispositivo, onActualizar, placa],
  );

  return (
    <section className="px-4 py-3.5 border-b border-zinc-800 bg-emerald-950/20">
      <h2 className="text-[10px] font-medium uppercase tracking-wider text-emerald-400/90 mb-2">
        Ubicación GPS — System Track
      </h2>

      <div className="overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900">
        <iframe
          title={`Mapa GPS ${gps.coords}`}
          src={embedUrl}
          className="w-full h-48 border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <div className="flex flex-wrap gap-2 mt-3 mb-2">
        <span className="inline-flex items-center rounded-full bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 text-xs font-medium text-emerald-200">
          {etiquetaEstadoGps(gps.online)}
        </span>
        <span className="inline-flex items-center rounded-full bg-zinc-800/90 border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 tabular-nums">
          {gps.speed} km/h
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

      <p className="text-[11px] text-zinc-500 truncate" title={gps.nombreDispositivo}>
        GPS: {gps.nombreDispositivo}
      </p>
      <p className="text-xs text-zinc-500 mt-1">
        Última actualización:{" "}
        <span className="text-zinc-300 tabular-nums">{gps.time}</span>
      </p>
      <p className="mt-1 text-xs text-zinc-500 tabular-nums">
        {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
      </p>

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
        GPS System Track
      </h2>
      <p className="text-sm text-amber-100/90 leading-snug">{mensaje}</p>
    </section>
  );
}
