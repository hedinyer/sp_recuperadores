import {
  buscarUbicacionGpsDs,
  buscarUbicacionGpsDsEnVivo,
  enviarComandoMotorDs,
  mensajeGpsDsNoDisponible,
} from "@/lib/dsTrackGps";
import {
  buscarUbicacionGpsIop,
  buscarUbicacionGpsIopEnVivo,
  enviarComandoMotorIop,
  mensajeGpsIopNoDisponible,
} from "@/lib/iopGps";
import {
  etiquetaProveedorGps,
  preferirDispositivoGps,
  resolverProveedorGps,
  enlaceMapaEmbebido,
  etiquetaEstadoGps,
  type AccionMotorGps,
  type ProveedorGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

export type { AccionMotorGps, ProveedorGps, UbicacionGpsMoto };
export { etiquetaEstadoGps, enlaceMapaEmbebido, etiquetaProveedorGps, resolverProveedorGps };

export type ResultadoBusquedaGps =
  | { ok: true; gps: UbicacionGpsMoto }
  | { ok: false; motivo: "sin_dispositivo" | "error_proveedor" };

export type ResultadoComandoMotor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

function gpsMotoExplicito(gpsMoto?: string | null): boolean {
  return String(gpsMoto ?? "").trim().length > 0;
}

function elegirMejorBusqueda(
  resultados: ResultadoBusquedaGps[],
): ResultadoBusquedaGps {
  let mejor: UbicacionGpsMoto | null = null;
  let huboErrorProveedor = false;

  for (const r of resultados) {
    if (!r.ok) {
      if (r.motivo === "error_proveedor") huboErrorProveedor = true;
      continue;
    }
    mejor = mejor ? preferirDispositivoGps(mejor, r.gps) : r.gps;
  }

  if (mejor) return { ok: true, gps: mejor };
  if (huboErrorProveedor) return { ok: false, motivo: "error_proveedor" };
  return { ok: false, motivo: "sin_dispositivo" };
}

export async function buscarUbicacionGps(
  placa: string,
  gpsMoto?: string | null,
): Promise<ResultadoBusquedaGps> {
  if (gpsMotoExplicito(gpsMoto)) {
    const proveedor = resolverProveedorGps(gpsMoto);
    if (proveedor === "iopgps") return buscarUbicacionGpsIop(placa);
    return buscarUbicacionGpsDs(placa);
  }

  const [iop, ds] = await Promise.all([
    buscarUbicacionGpsIop(placa),
    buscarUbicacionGpsDs(placa),
  ]);
  return elegirMejorBusqueda([iop, ds]);
}

export async function buscarUbicacionGpsEnVivo(
  placa: string,
  opciones?: {
    gpsMoto?: string | null;
    deviceId?: number;
    imei?: string;
  },
): Promise<ResultadoBusquedaGps> {
  if (gpsMotoExplicito(opciones?.gpsMoto)) {
    const proveedor = resolverProveedorGps(opciones?.gpsMoto);
    if (proveedor === "iopgps") {
      return buscarUbicacionGpsIopEnVivo(
        placa,
        opciones?.deviceId,
        opciones?.imei,
      );
    }
    return buscarUbicacionGpsDsEnVivo(placa, opciones?.deviceId);
  }

  const [iop, ds] = await Promise.all([
    buscarUbicacionGpsIopEnVivo(placa, opciones?.deviceId, opciones?.imei),
    buscarUbicacionGpsDsEnVivo(placa, opciones?.deviceId),
  ]);
  return elegirMejorBusqueda([iop, ds]);
}

export async function enviarComandoMotor(
  placa: string,
  accion: AccionMotorGps,
  gpsMoto?: string | null,
): Promise<ResultadoComandoMotor> {
  if (gpsMotoExplicito(gpsMoto)) {
    const proveedor = resolverProveedorGps(gpsMoto);
    if (proveedor === "iopgps") return enviarComandoMotorIop(placa, accion);
    return enviarComandoMotorDs(placa, accion);
  }

  const ubicacion = await buscarUbicacionGps(placa, gpsMoto);
  if (!ubicacion.ok) {
    return {
      ok: false,
      error: mensajeGpsNoDisponible(placa, ubicacion.motivo, gpsMoto),
    };
  }

  if (ubicacion.gps.proveedor === "iopgps") {
    return enviarComandoMotorIop(placa, accion);
  }
  return enviarComandoMotorDs(placa, accion);
}

export function mensajeGpsNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
  gpsMoto?: string | null,
): string {
  if (!gpsMotoExplicito(gpsMoto)) {
    if (motivo === "error_proveedor") {
      return "No se pudo consultar IOP GPS ni DS Track. Intenta de nuevo.";
    }
    return `La placa ${placa.trim().toUpperCase()} no aparece en IOP GPS ni en DS Track.`;
  }

  const proveedor = resolverProveedorGps(gpsMoto);
  if (proveedor === "iopgps") {
    return mensajeGpsIopNoDisponible(placa, motivo);
  }
  return mensajeGpsDsNoDisponible(placa, motivo);
}

/** Valor para columna `gps_moto` según el dispositivo elegido. */
export function gpsMotoDesdeProveedor(proveedor: ProveedorGps): string {
  return proveedor === "iopgps" ? "iop gps" : "ds track";
}
