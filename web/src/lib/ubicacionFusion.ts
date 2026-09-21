import type { UbicacionAirTag } from "@/lib/airtagLocations";
import {
  gpsConectadoFuncional,
  type ProveedorGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

export type FuenteUbicacion = "gps" | "airtag";

export type PosicionGpsLive = {
  lat: number;
  lng: number;
  time: string | null;
  online: string;
  funcional: boolean;
  proveedor: ProveedorGps;
};

export type PosicionAirTagLive = {
  lat: number;
  lng: number;
  visto_en: string | null;
  accuracy_m: number | null;
};

export type UbicacionFusionada = {
  lat: number;
  lng: number;
  /** Fuente fijada para telemetría continua (no oscila con online/offline). */
  fuente_preferida: FuenteUbicacion;
  fuente_activa: FuenteUbicacion;
  fuentes: { gps: boolean; airtag: boolean };
  airtag: {
    visto_en: string | null;
    accuracy_m: number | null;
  } | null;
  /** Timestamp de la fuente activa. */
  time: string | null;
  gps_pos: PosicionGpsLive | null;
  airtag_pos: PosicionAirTagLive | null;
};

function coordsValidas(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  );
}

/**
 * Elige fuente estable: si hay dispositivo GPS con coords → GPS;
 * si solo AirTag → AirTag. Respeta preferida previa para no oscilar.
 */
export function elegirFuentePreferida(
  tieneGps: boolean,
  tieneAirTag: boolean,
  preferida?: FuenteUbicacion | null,
): FuenteUbicacion | null {
  if (!tieneGps && !tieneAirTag) return preferida ?? null;

  if (preferida === "gps" && tieneGps) return "gps";
  if (preferida === "airtag" && tieneAirTag) return "airtag";

  // Preferida perdida este ciclo: mantener intención si la otra no existe.
  if (preferida === "gps" && !tieneGps && tieneAirTag) return "airtag";
  if (preferida === "airtag" && !tieneAirTag && tieneGps) return "gps";

  // Primera vez: GPS con dispositivo gana siempre (aunque esté offline).
  if (tieneGps) return "gps";
  if (tieneAirTag) return "airtag";
  return null;
}

/**
 * Fusiona GPS + AirTag sin alternar por online/offline.
 * GPS offline con última posición sigue siendo GPS.
 */
export function fusionarUbicacionGpsAirTag(
  gps: UbicacionGpsMoto | null,
  airtag: UbicacionAirTag | null,
  preferida?: FuenteUbicacion | null,
): UbicacionFusionada | null {
  const tieneGps = gps != null && coordsValidas(gps.lat, gps.lng);
  const tieneAirTag =
    airtag != null && coordsValidas(airtag.lat, airtag.lng);

  if (!tieneGps && !tieneAirTag) return null;

  const gps_pos: PosicionGpsLive | null = tieneGps
    ? {
        lat: gps!.lat,
        lng: gps!.lng,
        time: gps!.time || null,
        online: gps!.online,
        funcional: gpsConectadoFuncional(gps!.online),
        proveedor: gps!.proveedor,
      }
    : null;

  const airtag_pos: PosicionAirTagLive | null = tieneAirTag
    ? {
        lat: airtag!.lat,
        lng: airtag!.lng,
        visto_en: airtag!.visto_en,
        accuracy_m: airtag!.accuracy_m,
      }
    : null;

  const fuente_preferida = elegirFuentePreferida(
    tieneGps,
    tieneAirTag,
    preferida,
  );
  if (!fuente_preferida) return null;

  // Activa = preferida si tiene coords; si no, la otra (solo este snapshot).
  let fuente_activa: FuenteUbicacion = fuente_preferida;
  if (fuente_preferida === "gps" && !tieneGps && tieneAirTag) {
    fuente_activa = "airtag";
  } else if (fuente_preferida === "airtag" && !tieneAirTag && tieneGps) {
    fuente_activa = "gps";
  }

  if (fuente_activa === "gps" && gps_pos) {
    return {
      lat: gps_pos.lat,
      lng: gps_pos.lng,
      fuente_preferida,
      fuente_activa: "gps",
      fuentes: { gps: tieneGps, airtag: tieneAirTag },
      airtag: airtag_pos
        ? {
            visto_en: airtag_pos.visto_en,
            accuracy_m: airtag_pos.accuracy_m,
          }
        : null,
      time: gps_pos.time,
      gps_pos,
      airtag_pos,
    };
  }

  if (fuente_activa === "airtag" && airtag_pos) {
    return {
      lat: airtag_pos.lat,
      lng: airtag_pos.lng,
      fuente_preferida,
      fuente_activa: "airtag",
      fuentes: { gps: tieneGps, airtag: tieneAirTag },
      airtag: {
        visto_en: airtag_pos.visto_en,
        accuracy_m: airtag_pos.accuracy_m,
      },
      time: airtag_pos.visto_en,
      gps_pos,
      airtag_pos,
    };
  }

  return null;
}

export type EstadoTelemetriaPrevio = {
  lat: number | null;
  lng: number | null;
  fuente_preferida: FuenteUbicacion | null;
  fuente_activa: FuenteUbicacion | null;
  fuentes: { gps: boolean; airtag: boolean };
  gps_proveedor?: ProveedorGps | null;
};

/**
 * Fusion sticky para el cliente: nunca borra lat/lng si el live llega vacío
 * o cambia de fuente. Solo actualiza coords desde la fuente preferida.
 */
export function fusionarTelemetriaSticky(
  prev: EstadoTelemetriaPrevio,
  live: {
    gps_pos?: PosicionGpsLive | null;
    airtag_pos?: PosicionAirTagLive | null;
    fuentes?: { gps: boolean; airtag: boolean } | null;
    fuente_preferida?: FuenteUbicacion | null;
    fuente_activa?: FuenteUbicacion | null;
    lat?: number | null;
    lng?: number | null;
  },
): {
  lat: number | null;
  lng: number | null;
  fuente_preferida: FuenteUbicacion | null;
  fuente_activa: FuenteUbicacion | null;
  fuentes: { gps: boolean; airtag: boolean };
  gps_proveedor: ProveedorGps | null;
  actualizoCoords: boolean;
} {
  const gpsPos = live.gps_pos ?? null;
  const atPos = live.airtag_pos ?? null;
  const tieneGps = gpsPos != null && coordsValidas(gpsPos.lat, gpsPos.lng);
  const tieneAirTag = atPos != null && coordsValidas(atPos.lat, atPos.lng);

  const fuentes = {
    gps: Boolean(live.fuentes?.gps || tieneGps || prev.fuentes.gps),
    airtag: Boolean(live.fuentes?.airtag || tieneAirTag || prev.fuentes.airtag),
  };

  const fuente_preferida =
    elegirFuentePreferida(tieneGps || prev.fuentes.gps, tieneAirTag || prev.fuentes.airtag, prev.fuente_preferida) ??
    live.fuente_preferida ??
    prev.fuente_preferida ??
    (tieneGps ? "gps" : tieneAirTag ? "airtag" : null);

  // Proveedor GPS sticky (iop vs ds).
  let gps_proveedor: ProveedorGps | null =
    prev.gps_proveedor ?? null;
  if (gpsPos?.proveedor) {
    if (!gps_proveedor) gps_proveedor = gpsPos.proveedor;
    // Solo cambiar proveedor si el sticky no reporta y el otro sí (raro).
  }

  let lat = prev.lat;
  let lng = prev.lng;
  let fuente_activa = prev.fuente_activa;
  let actualizoCoords = false;

  const usarGps =
    fuente_preferida === "gps" &&
    tieneGps &&
    (!gps_proveedor || !gpsPos || gpsPos.proveedor === gps_proveedor || !prev.lat);

  const usarAirTag = fuente_preferida === "airtag" && tieneAirTag;

  if (usarGps && gpsPos) {
    lat = gpsPos.lat;
    lng = gpsPos.lng;
    fuente_activa = "gps";
    actualizoCoords = true;
    if (gpsPos.proveedor) gps_proveedor = gpsPos.proveedor;
  } else if (usarAirTag && atPos) {
    lat = atPos.lat;
    lng = atPos.lng;
    fuente_activa = "airtag";
    actualizoCoords = true;
  } else if (fuente_preferida === "gps" && tieneGps && gpsPos) {
    // Preferida GPS pero proveedor distinto: aún actualizar (mejor que quedarse frío).
    lat = gpsPos.lat;
    lng = gpsPos.lng;
    fuente_activa = "gps";
    actualizoCoords = true;
    gps_proveedor = gpsPos.proveedor;
  } else if (
    // Preferida sin datos este tick: NO borrar; solo marcar activa.
    prev.lat != null &&
    prev.lng != null
  ) {
    fuente_activa = fuente_preferida ?? prev.fuente_activa;
    // Mantener lat/lng previos
  } else if (tieneGps && gpsPos) {
    lat = gpsPos.lat;
    lng = gpsPos.lng;
    fuente_activa = "gps";
    actualizoCoords = true;
    gps_proveedor = gpsPos.proveedor;
  } else if (tieneAirTag && atPos) {
    lat = atPos.lat;
    lng = atPos.lng;
    fuente_activa = "airtag";
    actualizoCoords = true;
  }

  return {
    lat,
    lng,
    fuente_preferida,
    fuente_activa,
    fuentes,
    gps_proveedor,
    actualizoCoords,
  };
}
