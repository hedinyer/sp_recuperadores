"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MapaSeguirPlaca } from "@/components/MapaSeguirPlaca";
import {
  enlaceGoogleMapsRuta,
  mensajeErrorGps,
  vigilarGps,
  type GpsPreciso,
  type MotivoGpsError,
} from "@/lib/geolocation";
import {
  convieneRecalcularRuta,
  formatearDistanciaRuta,
  formatearDuracionRuta,
  obtenerRutaConduccion,
  type PuntoRuta,
  type RutaConduccion,
} from "@/lib/rutaOsrm";
import type { FuenteUbicacion } from "@/lib/ubicacionFusion";
import { fusionarTelemetriaSticky } from "@/lib/ubicacionFusion";

const POLL_MOTO_MS = 5_000;

type GpsMotoLive = {
  lat: number;
  lng: number;
  speed: number;
  course: number;
  online: string;
  estado: string;
  time: string;
  fuente?: FuenteUbicacion;
};

function placaDesdeParam(raw: string | string[] | undefined): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function etiquetaFuente(
  preferida: FuenteUbicacion | null | undefined,
  vistoEn?: string | null,
): string {
  if (preferida === "gps") return "GPS";
  if (preferida === "airtag") {
    if (!vistoEn?.trim()) return "Ubicación";
    const ms = new Date(vistoEn).getTime();
    if (!Number.isFinite(ms)) return "Ubicación";
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return "Visto ahora";
    if (min < 60) return `Visto hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Visto hace ${h} h`;
    return `Visto hace ${Math.floor(h / 24)} d`;
  }
  return "Sin señal";
}

export default function SeguirPlacaPage() {
  const params = useParams();
  const placa = placaDesdeParam(params?.placa);

  const [yo, setYo] = useState<GpsPreciso | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsActivo, setGpsActivo] = useState(false);

  const [moto, setMoto] = useState<GpsMotoLive | null>(null);
  const [fuentes, setFuentes] = useState<{
    gps: boolean;
    airtag: boolean;
  } | null>(null);
  const [fuentePreferida, setFuentePreferida] = useState<FuenteUbicacion | null>(
    null,
  );
  const [fuenteActiva, setFuenteActiva] = useState<FuenteUbicacion | null>(
    null,
  );
  const [motoMsg, setMotoMsg] = useState<string | null>(null);
  const [motoError, setMotoError] = useState<string | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState<string | null>(null);

  const [seguirMapa, setSeguirMapa] = useState(true);

  const [ruta, setRuta] = useState<RutaConduccion | null>(null);
  const rutaOrigenRef = useRef<PuntoRuta | null>(null);
  const rutaDestinoRef = useRef<PuntoRuta | null>(null);
  const abortRutaRef = useRef<AbortController | null>(null);
  const stickyRef = useRef({
    lat: null as number | null,
    lng: null as number | null,
    fuente_preferida: null as FuenteUbicacion | null,
    fuente_activa: null as FuenteUbicacion | null,
    fuentes: { gps: false, airtag: false },
  });

  const activarMiGps = useCallback(() => {
    setGpsError(null);
    setGpsActivo(true);
  }, []);

  const recentrar = useCallback(() => {
    setSeguirMapa(true);
  }, []);

  useEffect(() => {
    if (!gpsActivo) return;
    const stop = vigilarGps(
      (gps) => {
        setYo(gps);
        setGpsError(null);
      },
      (motivo: MotivoGpsError) => {
        setGpsError(mensajeErrorGps(motivo));
      },
    );
    return stop;
  }, [gpsActivo]);

  // Auto-pedir permiso al abrir el link (mejor UX en móvil).
  useEffect(() => {
    if (!placa) return;
    setGpsActivo(true);
  }, [placa]);

  useEffect(() => {
    if (!placa) return;
    let cancelled = false;
    let enCurso = false;

    const tick = async () => {
      if (cancelled || enCurso) return;
      enCurso = true;
      try {
        const res = await fetch(`/api/seguir/${encodeURIComponent(placa)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setMotoError(data.error ?? "Error al consultar la placa");
          return;
        }
        setMotoError(null);

        const fuenteApi = (raw: unknown): FuenteUbicacion | null => {
          if (raw === "gps") return "gps";
          if (raw === "senal" || raw === "airtag") return "airtag";
          return null;
        };

        const sticky = fusionarTelemetriaSticky(stickyRef.current, {
          gps_pos: data.gps_pos ?? null,
          airtag_pos: data.senal_pos ?? data.airtag_pos ?? null,
          fuentes: {
            gps: Boolean(data.gps_pos) || data.fuente === "gps",
            airtag: Boolean(data.senal_pos ?? data.airtag_pos) ||
              data.fuente === "senal" ||
              data.fuente === "airtag",
          },
          fuente_preferida: fuenteApi(
            data.fuente_preferida ?? data.fuente,
          ),
          fuente_activa: fuenteApi(data.fuente),
          lat: data.gps?.lat,
          lng: data.gps?.lng,
        });
        stickyRef.current = {
          lat: sticky.lat,
          lng: sticky.lng,
          fuente_preferida: sticky.fuente_preferida,
          fuente_activa: sticky.fuente_activa,
          fuentes: sticky.fuentes,
        };

        setFuentes(sticky.fuentes);
        setFuentePreferida(sticky.fuente_preferida);
        setFuenteActiva(sticky.fuente_activa);

        if (sticky.lat != null && sticky.lng != null) {
          setMoto({
            lat: sticky.lat,
            lng: sticky.lng,
            speed: data.gps?.speed ?? 0,
            course: data.gps?.course ?? 0,
            online:
              sticky.fuente_activa === "gps"
                ? (data.gps_pos?.online ?? data.gps?.online ?? "offline")
                : "ok",
            estado:
              sticky.fuente_activa === "gps"
                ? (data.gps?.estado ?? "GPS")
                : "Ubicación",
            time:
              data.gps?.time ??
              data.visto_en ??
              data.senal_pos?.visto_en ??
              data.airtag?.visto_en ??
              "",
            fuente: sticky.fuente_activa ?? undefined,
          });
          setMotoMsg(null);
        } else {
          setMotoMsg(data.mensaje ?? "Buscando señal…");
        }

        if (data.actualizadoEn) {
          setActualizadoEn(
            new Date(data.actualizadoEn).toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          );
        }
      } catch {
        if (!cancelled) setMotoError("No se pudo actualizar la ubicación");
      } finally {
        enCurso = false;
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), POLL_MOTO_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [placa]);

  const yoPunto = useMemo<PuntoRuta | null>(
    () => (yo ? { lat: yo.lat, lng: yo.lng } : null),
    [yo],
  );
  const motoPunto = useMemo<PuntoRuta | null>(
    () => (moto ? { lat: moto.lat, lng: moto.lng } : null),
    [moto],
  );

  useEffect(() => {
    if (!yoPunto || !motoPunto) return;

    if (
      !convieneRecalcularRuta(
        rutaOrigenRef.current,
        rutaDestinoRef.current,
        yoPunto,
        motoPunto,
      )
    ) {
      return;
    }

    abortRutaRef.current?.abort();
    const ac = new AbortController();
    abortRutaRef.current = ac;

    void obtenerRutaConduccion(yoPunto, motoPunto, ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      setRuta(r);
      rutaOrigenRef.current = yoPunto;
      rutaDestinoRef.current = motoPunto;
    });

    return () => ac.abort();
  }, [yoPunto, motoPunto]);

  const mapsHref =
    yoPunto && motoPunto ? enlaceGoogleMapsRuta(yoPunto, motoPunto) : null;

  const badgeFuente = etiquetaFuente(
    fuentePreferida ?? fuenteActiva,
    moto?.time ?? null,
  );

  if (!placa) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4 text-zinc-300">
        Placa no válida
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh max-w-[480px] mx-auto bg-zinc-950 text-zinc-100 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <header className="shrink-0 px-4 pt-3 pb-2 border-b border-zinc-800 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500">
          Seguimiento en vivo
        </p>
        <div className="flex items-baseline justify-between gap-2">
          <h1
            tabIndex={-1}
            className="text-xl font-bold tracking-wide text-white outline-none"
          >
            {placa}
          </h1>
          {moto ? (
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                (fuentePreferida ?? fuenteActiva) === "airtag"
                  ? "text-sky-300 bg-sky-950/60"
                  : moto.online === "online" || moto.online === "ack"
                    ? "text-emerald-300 bg-emerald-950/60"
                    : "text-emerald-300/80 bg-emerald-950/40"
              }`}
            >
              {badgeFuente}
              {(fuentePreferida ?? fuenteActiva) === "gps" &&
              moto.estado &&
              moto.estado !== "GPS"
                ? ` · ${moto.estado}`
                : ""}
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-zinc-500 tabular-nums" role="status">
          {ruta
            ? `${formatearDistanciaRuta(ruta.distancia_m)} · ${formatearDuracionRuta(ruta.duracion_s)}`
            : yoPunto && motoPunto
              ? "Calculando ruta…"
              : "Esperando ubicaciones…"}
          {actualizadoEn ? ` · moto ${actualizadoEn}` : null}
        </p>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <MapaSeguirPlaca
          yo={yoPunto}
          moto={motoPunto}
          ruta={ruta?.puntos ?? []}
          placa={placa}
          seguir={seguirMapa}
          onUsuarioMueveMapa={() => setSeguirMapa(false)}
        />
        {!seguirMapa && motoPunto ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] flex justify-center px-3">
            <button
              type="button"
              className="pointer-events-auto min-h-[44px] rounded-xl bg-zinc-800/95 px-4 text-sm font-semibold text-white shadow-lg ring-1 ring-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
              onClick={recentrar}
            >
              Recentrar
            </button>
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-zinc-800 space-y-2 bg-zinc-950">
        {gpsError && (
          <p className="text-[12px] text-rose-400" role="alert">
            {gpsError}
          </p>
        )}
        {motoError && (
          <p className="text-[12px] text-rose-400" role="alert">
            {motoError}
          </p>
        )}
        {motoMsg && !motoError && (
          <p className="text-[12px] text-amber-300/90">{motoMsg}</p>
        )}
        {!yo && !gpsError && (
          <p className="text-[12px] text-zinc-400">
            Permite el acceso a tu ubicación para armar la ruta.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {!yo ? (
            <button
              type="button"
              onClick={activarMiGps}
              className="col-span-2 min-h-[48px] rounded-xl bg-sky-700 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              Activar mi GPS
            </button>
          ) : (
            <p className="col-span-2 text-[11px] text-sky-300/90 tabular-nums">
              Tú: {yo.lat.toFixed(5)}, {yo.lng.toFixed(5)}
              {yo.accuracy_m != null
                ? ` · ±${Math.round(yo.accuracy_m)} m`
                : ""}
            </p>
          )}

          {mapsHref ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="col-span-2 min-h-[48px] inline-flex items-center justify-center rounded-xl bg-emerald-700 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              Navegar en Google Maps
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
