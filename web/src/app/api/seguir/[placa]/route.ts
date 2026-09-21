import { NextResponse } from "next/server";

import {
  fetchUbicacionesAirTag,
  resolverUbicacionAirTag,
} from "@/lib/airtagLocations";
import {
  buscarUbicacionGps,
  buscarUbicacionGpsEnVivo,
  mensajeGpsNoDisponible,
  type ResultadoBusquedaGps,
} from "@/lib/gpsMoto";
import { fusionarUbicacionGpsAirTag } from "@/lib/ubicacionFusion";
import type { UbicacionGpsMoto } from "@/lib/ubicacionGps";
import { etiquetaEstadoGps } from "@/lib/ubicacionGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Con AirTag listo no esperamos mucho al GPS; sin AirTag damos más margen. */
const GPS_TIMEOUT_CON_AIRTAG_MS = 3_500;
const GPS_TIMEOUT_SIN_AIRTAG_MS = 10_000;

async function conTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buscarGpsConTimeout(
  placa: string,
  timeoutMs: number,
): Promise<{ gps: UbicacionGpsMoto | null; timedOut: boolean }> {
  const fallido: ResultadoBusquedaGps & { __timeout?: boolean } = {
    ok: false,
    motivo: "sin_dispositivo",
    __timeout: true,
  };
  const intento = await conTimeout(
    (async () => {
      let r = await buscarUbicacionGpsEnVivo(placa);
      if (!r.ok) r = await buscarUbicacionGps(placa);
      return r;
    })(),
    timeoutMs,
    fallido,
  );
  const timedOut = "__timeout" in intento && intento.__timeout === true;
  return {
    gps: intento.ok ? intento.gps : null,
    timedOut,
  };
}

function respuestaPosicion(
  placa: string,
  gps: UbicacionGpsMoto | null,
  airtag: ReturnType<typeof resolverUbicacionAirTag>,
  gpsTimedOut = false,
) {
  const fusion = fusionarUbicacionGpsAirTag(gps, airtag);
  if (!fusion) {
    return {
      placa,
      gps: null,
      fuente: null,
      fuentes: { gps: false, airtag: false },
      mensaje: gpsTimedOut
        ? "Buscando señal GPS…"
        : gps
          ? "Sin posición"
          : mensajeGpsNoDisponible(placa, "sin_dispositivo"),
      actualizadoEn: new Date().toISOString(),
    };
  }

  return {
    placa,
    gps: {
      lat: fusion.lat,
      lng: fusion.lng,
      speed: gps?.speed ?? 0,
      course: gps?.course ?? 0,
      online:
        fusion.fuente_activa === "gps"
          ? (gps?.online ?? "offline")
          : "airtag",
      estado:
        fusion.fuente_activa === "gps"
          ? etiquetaEstadoGps(gps?.online ?? "")
          : "AirTag",
      time: fusion.time ?? "",
      fuente: fusion.fuente_activa,
    },
    fuente: fusion.fuente_activa,
    fuentes: fusion.fuentes,
    airtag: fusion.airtag,
    actualizadoEn: new Date().toISOString(),
  };
}

/** Solo datos de posición (sin comandos de motor). Público para links de seguimiento. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ placa: string }> },
) {
  const { placa: raw } = await context.params;
  const placa = normalizarPlaca(decodeURIComponent(raw ?? ""));
  if (!placa || placa.length < 5) {
    return NextResponse.json({ error: "Placa inválida" }, { status: 400 });
  }

  try {
    // AirTag primero (JSON público, rápido) para no bloquear el link compartido.
    const mapaAirTag = await fetchUbicacionesAirTag().catch(() => new Map());
    const airtag = resolverUbicacionAirTag(placa, mapaAirTag);
    const timeoutMs = airtag
      ? GPS_TIMEOUT_CON_AIRTAG_MS
      : GPS_TIMEOUT_SIN_AIRTAG_MS;

    const { gps, timedOut } = await buscarGpsConTimeout(placa, timeoutMs);
    return NextResponse.json(respuestaPosicion(placa, gps, airtag, timedOut));
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al consultar ubicación de la placa";
    console.error("[api/seguir]", placa, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
