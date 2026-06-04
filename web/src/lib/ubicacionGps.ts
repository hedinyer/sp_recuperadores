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

/** Intervalo de consulta en vivo (ms). System Track suele refrescar más rápido que IOP. */
export function intervaloPollGpsEnVivo(proveedor: ProveedorGps): number {
  return proveedor === "iopgps" ? 3000 : 2000;
}

/** Duración inicial de interpolación entre fixes GPS (ms), antes de medir intervalos reales. */
export function duracionAnimacionGpsInicial(proveedor: ProveedorGps): number {
  return proveedor === "iopgps" ? 9000 : 6000;
}

export function etiquetaIntervaloPollGps(proveedor: ProveedorGps): string {
  const s = intervaloPollGpsEnVivo(proveedor) / 1000;
  return s % 1 === 0 ? `${s} s` : `${s.toFixed(1).replace(".", ",")} s`;
}

export function deviceIdDesdeImei(imei: string): number {
  const digits = imei.replace(/\D/g, "");
  const n = parseInt(digits.slice(-9) || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function prioridadConexionGps(online: string): number {
  switch (online.toLowerCase()) {
    case "online":
      return 3;
    case "ack":
      return 2;
    case "offline":
      return 1;
    default:
      return 0;
  }
}

/** GPS reportando señal reciente (en línea o conectado, no offline). */
export function gpsConectadoFuncional(online: string): boolean {
  const o = online.toLowerCase();
  return o === "online" || o === "ack";
}

export function preferirDispositivoGps(
  actual: UbicacionGpsMoto,
  candidato: UbicacionGpsMoto,
): UbicacionGpsMoto {
  const diff =
    prioridadConexionGps(candidato.online) -
    prioridadConexionGps(actual.online);
  if (diff !== 0) return diff > 0 ? candidato : actual;
  return candidato.time >= actual.time ? candidato : actual;
}
