import type { PatronPago } from "@/lib/analisisMorosidad";
import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";
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
  preferirDispositivoGps,
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

/** Deuda mínima para ir a campo (≥ $500k); debajo es lista de llamadas. */
export const DEUDA_MIN_RECOGER_CAMPO_COP = 500_000;

/** Radio máximo desde ORIGEN_RECOGER_BOGOTA para la pestaña Recoger. */
export const DISTANCIA_MAX_RECOGER_KM = 25;

export type MotoRecogerBogota = {
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
} & PatronPago;

export type ResumenRecogerBogota = {
  total: number;
  con_gps: number;
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

export type PosicionLiveRecoger = {
  placa: string;
  lat: number | null;
  lng: number | null;
  distancia_km: number | null;
  gps: EstadoGpsPlaca;
};

/** Solo GPS fresco (sin recalcular deudas). */
export async function posicionesLiveRecogerBogota(
  placas: string[],
): Promise<{ posiciones: PosicionLiveRecoger[]; actualizadoEn: string }> {
  const mapa = await cargarMapaGpsUnificado(true);
  const vistas = new Set<string>();
  const posiciones: PosicionLiveRecoger[] = [];

  for (const raw of placas) {
    const placa = String(raw ?? "").trim().toUpperCase();
    if (!placa || vistas.has(placa)) continue;
    vistas.add(placa);

    const ubicacion = resolverUbicacionGps(placa, mapa);
    const lat = ubicacion?.lat ?? null;
    const lng = ubicacion?.lng ?? null;
    posiciones.push({
      placa,
      lat,
      lng,
      distancia_km:
        lat != null && lng != null
          ? distanciaKm(ORIGEN_RECOGER_BOGOTA, { lat, lng })
          : null,
      gps: ubicacion
        ? resolverEstadoGpsPlaca(placa, mapa)
        : ESTADO_GPS_SIN_DISPOSITIVO,
    });
  }

  return { posiciones, actualizadoEn: new Date().toISOString() };
}

export async function listarMotosRecogerBogota(
  refresh = false,
): Promise<{
  motos: MotoRecogerBogota[];
  resumen: ResumenRecogerBogota;
  origen: typeof ORIGEN_RECOGER_BOGOTA;
}> {
  const [{ atrasos }, mapa] = await Promise.all([
    fetchAtrasosDesdeDb(refresh),
    cargarMapaGpsUnificado(),
  ]);

  const candidatas = atrasos.filter(
    (a) =>
      a.deuda_total > DEUDA_MIN_RECOGER_BOGOTA_COP &&
      !PLACAS_EXCLUIDAS_RECOGER.has(normalizarPlaca(a.placa)),
  );

  const motos: MotoRecogerBogota[] = candidatas.map((a) => {
    const ubicacion = resolverUbicacionGps(a.placa, mapa);
    const gps = ubicacion
      ? resolverEstadoGpsPlaca(a.placa, mapa)
      : ESTADO_GPS_SIN_DISPOSITIVO;

    const lat = ubicacion?.lat ?? null;
    const lng = ubicacion?.lng ?? null;
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
      lat,
      lng,
      distancia_km,
      gps,
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

  const con_gps = motos.filter((m) => m.distancia_km != null).length;
  const deuda_total = motos.reduce((s, m) => s + m.deuda_total, 0);

  return {
    motos,
    resumen: {
      total: motos.length,
      con_gps,
      deuda_total,
      generado_en: new Date().toISOString(),
    },
    origen: ORIGEN_RECOGER_BOGOTA,
  };
}
