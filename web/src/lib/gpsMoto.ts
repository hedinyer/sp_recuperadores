import {
  buscarUbicacionGpsEnVivo as buscarStEnVivo,
  buscarUbicacionGps as buscarSt,
  enviarComandoMotor as comandoSt,
  etiquetaEstadoGps,
  enlaceMapaEmbebido,
  mensajeGpsNoDisponible as mensajeSt,
} from "@/lib/systemTrackGps";
import {
  buscarUbicacionGpsIop,
  buscarUbicacionGpsIopEnVivo,
  enviarComandoMotorIop,
  mensajeGpsIopNoDisponible,
} from "@/lib/iopGps";
import {
  etiquetaProveedorGps,
  resolverProveedorGps,
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

export async function buscarUbicacionGps(
  placa: string,
  gpsMoto?: string | null,
): Promise<ResultadoBusquedaGps> {
  const proveedor = resolverProveedorGps(gpsMoto);
  if (proveedor === "iopgps") return buscarUbicacionGpsIop(placa);
  return buscarSt(placa);
}

export async function buscarUbicacionGpsEnVivo(
  placa: string,
  opciones?: {
    gpsMoto?: string | null;
    deviceId?: number;
    imei?: string;
  },
): Promise<ResultadoBusquedaGps> {
  const proveedor = resolverProveedorGps(opciones?.gpsMoto);
  if (proveedor === "iopgps") {
    return buscarUbicacionGpsIopEnVivo(
      placa,
      opciones?.deviceId,
      opciones?.imei,
    );
  }
  return buscarStEnVivo(
    placa,
    opciones?.deviceId,
  );
}

export async function enviarComandoMotor(
  placa: string,
  accion: AccionMotorGps,
  gpsMoto?: string | null,
): Promise<ResultadoComandoMotor> {
  const proveedor = resolverProveedorGps(gpsMoto);
  if (proveedor === "iopgps") return enviarComandoMotorIop(placa, accion);
  return comandoSt(placa, accion);
}

export function mensajeGpsNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
  gpsMoto?: string | null,
): string {
  const proveedor = resolverProveedorGps(gpsMoto);
  if (proveedor === "iopgps") {
    return mensajeGpsIopNoDisponible(placa, motivo);
  }
  return mensajeSt(placa, motivo);
}
