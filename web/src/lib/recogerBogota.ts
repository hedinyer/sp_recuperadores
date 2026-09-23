import type { PatronPago } from "@/lib/analisisMorosidad";
import {
  fetchUbicacionesAirTag,
  resolverUbicacionAirTag,
  type UbicacionAirTag,
} from "@/lib/airtagLocations";
import {
  fetchAtrasosDesdeSpBogota,
  type AtrasoPinilla,
} from "@/lib/atrasosFromSpBogota";
import { fetchAtrasosDesdeDb, type ResultadoAtraso } from "@/lib/atrasosFromDb";
import { DEUDA_MIN_ASIGNADA_COP } from "@/lib/eliminarAsignacionBajaDeuda";
import {
  cargarMapaGpsUnificado,
  ESTADO_GPS_SIN_DISPOSITIVO,
  resolverEstadoGpsPlaca,
  type EstadoGpsPlaca,
} from "@/lib/gpsEstadoPlacas";
import { variantesPlaca } from "@/lib/placaGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import {
  fusionarUbicacionGpsAirTag,
  type FuenteUbicacion,
  type PosicionAirTagLive,
  type PosicionGpsLive,
} from "@/lib/ubicacionFusion";
import {
  preferirDispositivoGps,
  type ProveedorGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

/** Placas que no deben salir en Recoger Bogotá. */
const PLACAS_EXCLUIDAS_RECOGER = new Set(
  [
    "CHU69I",
    "ZOT51H",
    "TSQ44H",
    "DTW01I",
    "TRT89H",
    "ZOT45H",
    "DOW24I",
    "ZOT44H",
    "DVF01I",
    "ZOK44H",
  ].map(normalizarPlaca),
);

export const ORIGEN_RECOGER_BOGOTA = {
  lat: 4.667372044635534,
  lng: -74.06239794213879,
} as const;

/** Piso de la página (sigue viniendo de atrasos filtrados). */
export const DEUDA_MIN_RECOGER_BOGOTA_COP = DEUDA_MIN_ASIGNADA_COP;

/** Deuda mínima para ir a campo (≥ $700k); debajo es lista de llamadas. */
export const DEUDA_MIN_RECOGER_CAMPO_COP = 700_000;

/** Radio máximo desde el punto de origen para la pestaña Recoger. */
export const DISTANCIA_MAX_RECOGER_KM = 30;

export type OrigenCarteraRecoger = "pinilla" | "railway";

export type MotoRecogerBogota = {
  placa: string;
  nombre: string;
  telefono: string;
  cedula: string;
  deuda_total: number;
  cuotas_pendientes: number;
  valor_cuota: number;
  pago_hoy: boolean;
  origen: OrigenCarteraRecoger;
  lat: number | null;
  lng: number | null;
  distancia_km: number | null;
  gps: EstadoGpsPlaca;
  fuentes: { gps: boolean; airtag: boolean };
  /** Fuente fija de telemetría (no oscila). */
  fuente_preferida: FuenteUbicacion | null;
  fuente_activa: FuenteUbicacion | null;
  airtag: {
    visto_en: string | null;
    accuracy_m: number | null;
  } | null;
  gps_pos: PosicionGpsLive | null;
  airtag_pos: PosicionAirTagLive | null;
  gps_proveedor: ProveedorGps | null;
} & PatronPago;

export type ResumenRecogerBogota = {
  total: number;
  con_gps: number;
  con_ubicacion: number;
  deuda_total: number;
  generado_en: string;
};

/** Distancia Haversine en km. */
export function distanciaKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

function resolverUbicacionGps(
  placa: string,
  mapa: Map<string, UbicacionGpsMoto>,
): UbicacionGpsMoto | null {
  let mejor: UbicacionGpsMoto | null = null;
  for (const clave of variantesPlaca(placa)) {
    const hit = mapa.get(clave);
    if (!hit) continue;
    mejor = mejor ? preferirDispositivoGps(mejor, hit) : hit;
  }
  return mejor;
}

async function cargarMapaAirTagSeguro(): Promise<Map<string, UbicacionAirTag>> {
  try {
    return await fetchUbicacionesAirTag();
  } catch (e) {
    console.warn(
      "[recogerBogota] AirTags no disponibles:",
      e instanceof Error ? e.message : e,
    );
    return new Map();
  }
}

export type PosicionLiveRecoger = {
  placa: string;
  lat: number | null;
  lng: number | null;
  distancia_km: number | null;
  gps: EstadoGpsPlaca;
  fuentes: { gps: boolean; airtag: boolean };
  fuente_preferida: FuenteUbicacion | null;
  fuente_activa: FuenteUbicacion | null;
  airtag: {
    visto_en: string | null;
    accuracy_m: number | null;
  } | null;
  gps_pos: PosicionGpsLive | null;
  airtag_pos: PosicionAirTagLive | null;
};

/** Solo posiciones frescas (sin recalcular deudas). */
export async function posicionesLiveRecogerBogota(
  placas: string[],
): Promise<{ posiciones: PosicionLiveRecoger[]; actualizadoEn: string }> {
  const [mapa, mapaAirTag] = await Promise.all([
    cargarMapaGpsUnificado(true),
    cargarMapaAirTagSeguro(),
  ]);
  const vistas = new Set<string>();
  const posiciones: PosicionLiveRecoger[] = [];

  for (const raw of placas) {
    const placa = String(raw ?? "").trim().toUpperCase();
    if (!placa || vistas.has(placa)) continue;
    vistas.add(placa);

    const ubicacionGps = resolverUbicacionGps(placa, mapa);
    const ubicacionAirTag = resolverUbicacionAirTag(placa, mapaAirTag);
    const fusion = fusionarUbicacionGpsAirTag(ubicacionGps, ubicacionAirTag);

    const lat = fusion?.lat ?? null;
    const lng = fusion?.lng ?? null;
    posiciones.push({
      placa,
      lat,
      lng,
      distancia_km:
        lat != null && lng != null
          ? distanciaKm(ORIGEN_RECOGER_BOGOTA, { lat, lng })
          : null,
      gps: ubicacionGps
        ? resolverEstadoGpsPlaca(placa, mapa)
        : ESTADO_GPS_SIN_DISPOSITIVO,
      fuentes: fusion?.fuentes ?? { gps: false, airtag: false },
      fuente_preferida: fusion?.fuente_preferida ?? null,
      fuente_activa: fusion?.fuente_activa ?? null,
      airtag: fusion?.airtag ?? null,
      gps_pos: fusion?.gps_pos ?? null,
      airtag_pos: fusion?.airtag_pos ?? null,
    });
  }

  return { posiciones, actualizadoEn: new Date().toISOString() };
}

type CandidataRecoger = {
  placa: string;
  nombre: string;
  telefono: string;
  cedula: string;
  deuda_total: number;
  cuotas_pendientes: number;
  valor_cuota: number;
  pago_hoy: boolean;
  origen: OrigenCarteraRecoger;
} & PatronPago;

function desdeRailway(a: ResultadoAtraso): CandidataRecoger {
  return {
    placa: a.placa,
    nombre: a.nombre,
    telefono: a.telefono,
    cedula: a.cedula,
    deuda_total: a.deuda_total,
    cuotas_pendientes: a.cuotas_pendientes,
    valor_cuota: a.valor_cuota,
    pago_hoy: a.pago_hoy,
    origen: "railway",
    frecuencia_principal: a.frecuencia_principal,
    frecuencia_etiqueta: a.frecuencia_etiqueta,
    frecuencia_confianza: a.frecuencia_confianza,
    dias_promedio_entre_pagos: a.dias_promedio_entre_pagos,
    regularidad_score: a.regularidad_score,
    pagos_irregulares: a.pagos_irregulares,
  };
}

function mergeCandidatas(
  railway: ResultadoAtraso[],
  pinilla: AtrasoPinilla[],
): CandidataRecoger[] {
  const byPlaca = new Map<string, CandidataRecoger>();
  for (const a of railway) {
    const key = normalizarPlaca(a.placa);
    if (!key) continue;
    byPlaca.set(key, desdeRailway(a));
  }
  for (const a of pinilla) {
    const key = normalizarPlaca(a.placa);
    if (!key) continue;
    const prev = byPlaca.get(key);
    if (!prev || a.deuda_total > prev.deuda_total) {
      byPlaca.set(key, {
        ...a,
        nombre: a.nombre || prev?.nombre || "",
        telefono: a.telefono || prev?.telefono || "",
        cedula: a.cedula || prev?.cedula || "",
      });
    } else {
      byPlaca.set(key, {
        ...prev,
        nombre: prev.nombre || a.nombre,
        telefono: prev.telefono || a.telefono,
        cedula: prev.cedula || a.cedula,
        origen: "pinilla",
      });
    }
  }
  return [...byPlaca.values()];
}

export async function listarMotosRecogerBogota(
  refresh = false,
): Promise<{
  motos: MotoRecogerBogota[];
  resumen: ResumenRecogerBogota;
  origen: typeof ORIGEN_RECOGER_BOGOTA;
}> {
  const [{ atrasos }, pinilla, mapa, mapaAirTag] = await Promise.all([
    fetchAtrasosDesdeDb(refresh),
    fetchAtrasosDesdeSpBogota(),
    cargarMapaGpsUnificado(),
    cargarMapaAirTagSeguro(),
  ]);

  const candidatas = mergeCandidatas(atrasos, pinilla).filter(
    (a) =>
      !PLACAS_EXCLUIDAS_RECOGER.has(normalizarPlaca(a.placa)) &&
      (a.origen === "pinilla" || a.deuda_total > DEUDA_MIN_RECOGER_BOGOTA_COP),
  );

  const motos: MotoRecogerBogota[] = candidatas.map((a) => {
    const ubicacionGps = resolverUbicacionGps(a.placa, mapa);
    const ubicacionAirTag = resolverUbicacionAirTag(a.placa, mapaAirTag);
    const fusion = fusionarUbicacionGpsAirTag(ubicacionGps, ubicacionAirTag);

    const gps = ubicacionGps
      ? resolverEstadoGpsPlaca(a.placa, mapa)
      : ESTADO_GPS_SIN_DISPOSITIVO;

    const lat = fusion?.lat ?? null;
    const lng = fusion?.lng ?? null;
    const distancia_km =
      lat != null && lng != null
        ? distanciaKm(ORIGEN_RECOGER_BOGOTA, { lat, lng })
        : null;

    return {
      placa: a.placa,
      nombre: a.nombre,
      telefono: a.telefono,
      cedula: a.cedula,
      deuda_total: a.deuda_total,
      cuotas_pendientes: a.cuotas_pendientes,
      valor_cuota: a.valor_cuota,
      pago_hoy: a.pago_hoy,
      origen: a.origen,
      lat,
      lng,
      distancia_km,
      gps,
      fuentes: fusion?.fuentes ?? { gps: false, airtag: false },
      fuente_preferida: fusion?.fuente_preferida ?? null,
      fuente_activa: fusion?.fuente_activa ?? null,
      airtag: fusion?.airtag ?? null,
      gps_pos: fusion?.gps_pos ?? null,
      airtag_pos: fusion?.airtag_pos ?? null,
      gps_proveedor: fusion?.gps_pos?.proveedor ?? gps.proveedor,
      frecuencia_principal: a.frecuencia_principal,
      frecuencia_etiqueta: a.frecuencia_etiqueta,
      frecuencia_confianza: a.frecuencia_confianza,
      dias_promedio_entre_pagos: a.dias_promedio_entre_pagos,
      regularidad_score: a.regularidad_score,
      pagos_irregulares: a.pagos_irregulares,
    };
  });

  motos.sort((x, y) => {
    const dx = x.distancia_km;
    const dy = y.distancia_km;
    if (dx != null && dy != null) return dx - dy;
    if (dx != null) return -1;
    if (dy != null) return 1;
    return y.deuda_total - x.deuda_total;
  });

  const con_gps = motos.filter((m) => m.gps.funcional).length;
  const con_ubicacion = motos.filter(
    (m) => m.lat != null && m.lng != null,
  ).length;
  const deuda_total = motos.reduce((s, m) => s + m.deuda_total, 0);

  return {
    motos,
    resumen: {
      total: motos.length,
      con_gps,
      con_ubicacion,
      deuda_total,
      generado_en: new Date().toISOString(),
    },
    origen: ORIGEN_RECOGER_BOGOTA,
  };
}
