export type ProveedorGps = "system_track" | "iopgps";

export type AccionMotorGps = "bloquear" | "desbloquear";

export type UbicacionGpsMoto = {
  proveedor: ProveedorGps;
  /** ID numérico (System Track) o derivado del IMEI (IOP). */
  deviceId: number;
  imei: string;
  lat: number;
  lng: number;
  speed: number;
  course: number;
  time: string;
  online: string;
  coords: string;
  bloqueado: boolean;
  nombreDispositivo: string;
  /** Cuenta IOP (appid) que reportó el dispositivo, para comandos. */
  iopCuenta?: string;
};

export function resolverProveedorGps(raw: string | null | undefined): ProveedorGps {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("system")) return "system_track";
  return "iopgps";
}

export function etiquetaProveedorGps(proveedor: ProveedorGps): string {
  return proveedor === "iopgps" ? "IOP GPS" : "System Track";
}

export function deviceIdDesdeImei(imei: string): number {
  const digits = imei.replace(/\D/g, "");
  const n = parseInt(digits.slice(-9) || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
