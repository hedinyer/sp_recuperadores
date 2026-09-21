import type { UbicacionAirTag } from "@/lib/airtagLocations";
import {
  gpsConectadoFuncional,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

export type FuenteUbicacion = "gps" | "airtag";

export type UbicacionFusionada = {
  lat: number;
  lng: number;
  fuente_activa: FuenteUbicacion;
  fuentes: { gps: boolean; airtag: boolean };
  airtag: {
    visto_en: string | null;
    accuracy_m: number | null;
  } | null;
  /** Timestamp ISO de la fuente elegida (GPS time o AirTag visto_en). */
  time: string | null;
};

function msDeTimestamp(raw: string | null | undefined): number {
  if (!raw?.trim()) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Elige coords a pintar: GPS funcional gana; si no, AirTag;
 * si ambos tienen fix, el timestamp más reciente.
 */
export function fusionarUbicacionGpsAirTag(
  gps: UbicacionGpsMoto | null,
  airtag: UbicacionAirTag | null,
): UbicacionFusionada | null {
  const tieneGps = gps != null && Number.isFinite(gps.lat) && Number.isFinite(gps.lng);
  const tieneAirTag =
    airtag != null &&
    Number.isFinite(airtag.lat) &&
    Number.isFinite(airtag.lng);

  if (!tieneGps && !tieneAirTag) return null;

  const airtagMeta = tieneAirTag
    ? { visto_en: airtag!.visto_en, accuracy_m: airtag!.accuracy_m }
    : null;

  if (tieneGps && !tieneAirTag) {
    return {
      lat: gps!.lat,
      lng: gps!.lng,
      fuente_activa: "gps",
      fuentes: { gps: true, airtag: false },
      airtag: null,
      time: gps!.time || null,
    };
  }

  if (!tieneGps && tieneAirTag) {
    return {
      lat: airtag!.lat,
      lng: airtag!.lng,
      fuente_activa: "airtag",
      fuentes: { gps: false, airtag: true },
      airtag: airtagMeta,
      time: airtag!.visto_en,
    };
  }

  // Ambos presentes
  const gpsFuncional = gpsConectadoFuncional(gps!.online);
  let fuente_activa: FuenteUbicacion;

  if (gpsFuncional) {
    fuente_activa = "gps";
  } else {
    const gpsMs = msDeTimestamp(gps!.time);
    const atMs = msDeTimestamp(airtag!.visto_en);
    fuente_activa = atMs > gpsMs ? "airtag" : "gps";
  }

  if (fuente_activa === "gps") {
    return {
      lat: gps!.lat,
      lng: gps!.lng,
      fuente_activa: "gps",
      fuentes: { gps: true, airtag: true },
      airtag: airtagMeta,
      time: gps!.time || null,
    };
  }

  return {
    lat: airtag!.lat,
    lng: airtag!.lng,
    fuente_activa: "airtag",
    fuentes: { gps: true, airtag: true },
    airtag: airtagMeta,
    time: airtag!.visto_en,
  };
}
