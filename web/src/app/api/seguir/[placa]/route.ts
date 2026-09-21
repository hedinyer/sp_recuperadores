import { NextResponse } from "next/server";

import {
  fetchUbicacionesAirTag,
  resolverUbicacionAirTag,
} from "@/lib/airtagLocations";
import {
  buscarUbicacionGps,
  buscarUbicacionGpsEnVivo,
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
      mensaje: gpsTimedOut
        ? "Buscando señal…"
        : "Sin posición para esta placa",
      actualizadoEn: new Date().toISOString(),
    };
  }

  // Respuesta pública: sin nombres de proveedor secundario.
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
          : "ok",
      estado:
        fusion.fuente_activa === "gps"
          ? etiquetaEstadoGps(gps?.online ?? "")
          : "Ubicación",
      time: fusion.time ?? "",
      fuente: fusion.fuente_activa === "gps" ? "gps" : "senal",
    },
    fuente: fusion.fuente_activa === "gps" ? "gps" : "senal",
    fuente_preferida:
      fusion.fuente_preferida === "gps" ? "gps" : "senal",
    visto_en:
      fusion.fuente_activa !== "gps"
        ? fusion.airtag?.visto_en ?? fusion.time
        : null,
    gps_pos: fusion.gps_pos
      ? {
          lat: fusion.gps_pos.lat,
          lng: fusion.gps_pos.lng,
          time: fusion.gps_pos.time,
          online: fusion.gps_pos.online,
          funcional: fusion.gps_pos.funcional,
          proveedor: fusion.gps_pos.proveedor,
        }
      : null,
    // Posición secundaria sin etiquetar el origen.
    senal_pos: fusion.airtag_pos
      ? {
          lat: fusion.airtag_pos.lat,
          lng: fusion.airtag_pos.lng,
          visto_en: fusion.airtag_pos.visto_en,
          accuracy_m: fusion.airtag_pos.accuracy_m,
        }
      : null,
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
