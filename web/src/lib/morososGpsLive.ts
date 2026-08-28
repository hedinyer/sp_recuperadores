import {
  cargarMapaGpsUnificado,
  ESTADO_GPS_SIN_DISPOSITIVO,
  resolverEstadoGpsPlaca,
  type EstadoGpsPlaca,
} from "@/lib/gpsEstadoPlacas";
import { variantesPlaca } from "@/lib/placaGps";
import {
  gpsConectadoFuncional,
  preferirDispositivoGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

export type PosicionLiveMoroso = {
  placa: string;
  lat: number | null;
  lng: number | null;
  online: boolean;
  gps: EstadoGpsPlaca;
};

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

/** Posiciones GPS en vivo para morosos (sin recalcular deudas). */
export async function posicionesLiveMorosos(
  placas: string[],
): Promise<{ posiciones: PosicionLiveMoroso[]; actualizadoEn: string }> {
  const mapa = await cargarMapaGpsUnificado(true);
  const vistas = new Set<string>();
  const posiciones: PosicionLiveMoroso[] = [];

  for (const raw of placas.slice(0, 200)) {
    const placa = String(raw ?? "").trim().toUpperCase().replace(/\s/g, "");
    if (!placa || vistas.has(placa)) continue;
    vistas.add(placa);

    const ubicacion = resolverUbicacionGps(placa, mapa);
    const gps = ubicacion
      ? resolverEstadoGpsPlaca(placa, mapa)
      : ESTADO_GPS_SIN_DISPOSITIVO;

    posiciones.push({
      placa,
      lat: ubicacion?.lat ?? null,
      lng: ubicacion?.lng ?? null,
      online: ubicacion ? gpsConectadoFuncional(ubicacion.online) : false,
      gps,
    });
  }

  return { posiciones, actualizadoEn: new Date().toISOString() };
}
