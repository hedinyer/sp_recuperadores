import { mapaDispositivosPorPlacaDs } from "@/lib/dsTrackGps";
import { mapaDispositivosPorPlacaIop } from "@/lib/iopGps";
import { variantesPlaca } from "@/lib/placaGps";
import {
  etiquetaEstadoGps,
  etiquetaProveedorGps,
  gpsConectadoFuncional,
  preferirDispositivoGps,
  type ProveedorGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

export type EstadoGpsPlaca = {
  proveedor: ProveedorGps | null;
  proveedor_etiqueta: string;
  online: string | null;
  funcional: boolean;
  estado_etiqueta: string;
  gps_moto: string;
};

export const ESTADO_GPS_SIN_DISPOSITIVO: EstadoGpsPlaca = {
  proveedor: null,
  proveedor_etiqueta: "—",
  online: null,
  funcional: false,
  estado_etiqueta: "Sin GPS",
  gps_moto: "",
};

function gpsMotoDesdeProveedor(proveedor: ProveedorGps): string {
  return proveedor === "iopgps" ? "iop gps" : "ds track";
}

function estadoDesdeDispositivo(gps: UbicacionGpsMoto): EstadoGpsPlaca {
  return {
    proveedor: gps.proveedor,
    proveedor_etiqueta: etiquetaProveedorGps(gps.proveedor),
    online: gps.online,
    funcional: gpsConectadoFuncional(gps.online),
    estado_etiqueta: etiquetaEstadoGps(gps.online),
    gps_moto: gpsMotoDesdeProveedor(gps.proveedor),
  };
}

export async function cargarMapaGpsUnificado(
  enVivo = false,
): Promise<Map<string, UbicacionGpsMoto>> {
  const unificado = new Map<string, UbicacionGpsMoto>();
  const opts = enVivo ? { enVivo: true as const } : undefined;
  const resultados = await Promise.allSettled([
    mapaDispositivosPorPlacaDs(opts),
    mapaDispositivosPorPlacaIop(opts),
  ]);

  for (const r of resultados) {
    if (r.status !== "fulfilled") {
      console.warn(
        "[gpsEstadoPlacas] proveedor falló:",
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
      continue;
    }
    for (const [placa, gps] of r.value) {
      const prev = unificado.get(placa);
      unificado.set(placa, prev ? preferirDispositivoGps(prev, gps) : gps);
    }
  }

  return unificado;
}

export function resolverEstadoGpsPlaca(
  placa: string,
  mapa: Map<string, UbicacionGpsMoto>,
): EstadoGpsPlaca {
  const claves = variantesPlaca(placa);
  let mejor: UbicacionGpsMoto | null = null;

  for (const clave of claves) {
    const hit = mapa.get(clave);
    if (!hit) continue;
    mejor = mejor ? preferirDispositivoGps(mejor, hit) : hit;
  }

  return mejor ? estadoDesdeDispositivo(mejor) : ESTADO_GPS_SIN_DISPOSITIVO;
}

export async function enriquecerConEstadoGps<T extends { placa: string }>(
  items: T[],
): Promise<(T & { gps: EstadoGpsPlaca })[]> {
  const mapa = await cargarMapaGpsUnificado();
  return items.map((item) => ({
    ...item,
    gps: resolverEstadoGpsPlaca(item.placa, mapa),
  }));
}
