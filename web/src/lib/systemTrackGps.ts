import { extraerPlacasDeTexto, variantesPlaca } from "@/lib/placaGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import type {
  AccionMotorGps,
  UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

export type { AccionMotorGps, UbicacionGpsMoto };

const SYSTEMTRACK_BASE_URL =
  process.env.SYSTEMTRACK_API_URL?.trim() ||
  "https://plataforma.sistemagps.online";
const SYSTEMTRACK_EMAIL =
  process.env.SYSTEMTRACK_EMAIL?.trim() || "marisolpinilla@hotmail.com";
const SYSTEMTRACK_PASSWORD =
  process.env.SYSTEMTRACK_PASSWORD?.trim() || "123456";
const SYSTEMTRACK_USER_API_HASH_FALLBACK =
  process.env.SYSTEMTRACK_USER_API_HASH?.trim() ||
  "$2y$10$OCkjP58xbNyEeR8MYK4evePR/l2sVfPI.Qj/W2prKGWxG35OnxIve";

const CACHE_TTL_MS = 45_000;
/** Sin caché en vivo: cada poll pide datos frescos a GPSWOX. */
const CACHE_TTL_EN_VIVO_MS = 0;
const AUTH_TTL_MS = 25 * 60_000;

type GpsSensor = {
  tag_name?: string;
  name?: string;
  val?: boolean;
  value?: string;
};

type GpsDeviceItem = {
  id?: number;
  lat?: number;
  lng?: number;
  speed?: number;
  course?: number;
  time?: string;
  online?: string;
  name?: string;
  sensors?: GpsSensor[];
  device_data?: { plate_number?: string };
};

type GpsDeviceGroup = {
  items?: GpsDeviceItem[];
};

type LoginResponse = {
  status?: number;
  user_api_hash?: string;
};

type SendCommandResponse = {
  status?: number;
  message?: string;
  error?: string;
};

let cacheDispositivos: {
  fetchedAt: number;
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
} | null = null;
let cacheAuth: { hash: string; fetchedAt: number } | null = null;

function clavesPlacaDispositivo(item: GpsDeviceItem): string[] {
  const claves = new Set<string>();
  for (const placa of extraerPlacasDeTexto(String(item.device_data?.plate_number ?? ""))) {
    claves.add(placa);
  }
  for (const placa of extraerPlacasDeTexto(String(item.name ?? ""))) {
    claves.add(placa);
  }
  return [...claves];
}

function leerBloqueo(item: GpsDeviceItem): boolean {
  const sensor = item.sensors?.find(
    (s) => s.tag_name === "blocked" || s.name === "Bloqueo",
  );
  if (!sensor) return false;
  if (typeof sensor.val === "boolean") return sensor.val;
  return String(sensor.value ?? "").trim().toLowerCase() === "on";
}

function prioridadConexion(online: string): number {
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

function preferirDispositivo(
  actual: UbicacionGpsMoto,
  candidato: UbicacionGpsMoto,
): UbicacionGpsMoto {
  const diff = prioridadConexion(candidato.online) - prioridadConexion(actual.online);
  if (diff !== 0) return diff > 0 ? candidato : actual;
  return candidato.time >= actual.time ? candidato : actual;
}

function mapearDispositivo(item: GpsDeviceItem): UbicacionGpsMoto | null {
  const deviceId = Number(item.id);
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(deviceId) || deviceId <= 0) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  return {
    proveedor: "system_track",
    deviceId,
    imei: "",
    lat,
    lng,
    speed: Number(item.speed) || 0,
    course: Number(item.course) || 0,
    time: String(item.time ?? "").trim() || "—",
    online: String(item.online ?? "").trim() || "offline",
    coords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    bloqueado: leerBloqueo(item),
    nombreDispositivo: String(item.name ?? "").trim() || "—",
  };
}

function invalidarCachesDispositivos(): void {
  cacheDispositivos = null;
}

async function obtenerUserApiHash(force = false): Promise<string> {
  const ahora = Date.now();
  if (!force && cacheAuth && ahora - cacheAuth.fetchedAt < AUTH_TTL_MS) {
    return cacheAuth.hash;
  }

  try {
    const res = await fetch(`${SYSTEMTRACK_BASE_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email: SYSTEMTRACK_EMAIL,
        password: SYSTEMTRACK_PASSWORD,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (res.ok) {
      const data = (await res.json()) as LoginResponse;
      const hash = String(data.user_api_hash ?? "").trim();
      if (data.status === 1 && hash) {
        cacheAuth = { hash, fetchedAt: ahora };
        return hash;
      }
    }
  } catch (e) {
    console.warn(
      "[systemTrackGps] login:",
      e instanceof Error ? e.message : e,
    );
  }

  return SYSTEMTRACK_USER_API_HASH_FALLBACK;
}

async function fetchDispositivos(apiHash: string): Promise<GpsDeviceGroup[]> {
  const url = new URL(`${SYSTEMTRACK_BASE_URL}/api/get_devices`);
  url.searchParams.set("lang", "en");
  url.searchParams.set("user_api_hash", apiHash);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`System Track respondió ${res.status}`);
  }

  const data = (await res.json()) as GpsDeviceGroup[];
  if (!Array.isArray(data)) {
    throw new Error("Respuesta inválida de System Track");
  }
  return data;
}

/** Posiciones recientes (GPSWOX); misma forma que get_devices. */
async function fetchDispositivosLatest(
  apiHash: string,
): Promise<GpsDeviceGroup[] | null> {
  const url = new URL(`${SYSTEMTRACK_BASE_URL}/api/get_devices_latest`);
  url.searchParams.set("user_api_hash", apiHash);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as GpsDeviceGroup[];
  if (!Array.isArray(data)) return null;
  const total = data.reduce((n, g) => n + (g.items?.length ?? 0), 0);
  return total > 0 ? data : null;
}

function indexarDispositivos(data: GpsDeviceGroup[]): {
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
} {
  const porPlaca = new Map<string, UbicacionGpsMoto>();
  const porDeviceId = new Map<number, UbicacionGpsMoto>();

  for (const grupo of data) {
    for (const item of grupo.items ?? []) {
      const dispositivo = mapearDispositivo(item);
      if (!dispositivo) continue;

      const prevId = porDeviceId.get(dispositivo.deviceId);
      porDeviceId.set(
        dispositivo.deviceId,
        prevId ? preferirDispositivo(prevId, dispositivo) : dispositivo,
      );

      for (const clave of clavesPlacaDispositivo(item)) {
        const existente = porPlaca.get(clave);
        porPlaca.set(
          clave,
          existente
            ? preferirDispositivo(existente, dispositivo)
            : dispositivo,
        );
      }
    }
  }

  return { porPlaca, porDeviceId };
}

type OpcionesCargaGps = {
  /** TTL corto para seguimiento en vivo (polling). */
  enVivo?: boolean;
};

async function cargarDispositivos(
  opciones?: OpcionesCargaGps,
): Promise<{
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
}> {
  const ahora = Date.now();
  const ttl = opciones?.enVivo ? CACHE_TTL_EN_VIVO_MS : CACHE_TTL_MS;

  if (cacheDispositivos && ahora - cacheDispositivos.fetchedAt < ttl) {
    return {
      porPlaca: cacheDispositivos.porPlaca,
      porDeviceId: cacheDispositivos.porDeviceId,
    };
  }

  let apiHash = await obtenerUserApiHash();
  let data =
    opciones?.enVivo ? await fetchDispositivosLatest(apiHash) : null;
  if (!data) {
    data = await fetchDispositivos(apiHash);
  }

  const totalItems = data.reduce((n, g) => n + (g.items?.length ?? 0), 0);
  if (totalItems <= 10) {
    invalidarCachesDispositivos();
    apiHash = await obtenerUserApiHash(true);
    data = await fetchDispositivos(apiHash);
  }

  const { porPlaca, porDeviceId } = indexarDispositivos(data);
  cacheDispositivos = { fetchedAt: ahora, porPlaca, porDeviceId };
  return { porPlaca, porDeviceId };
}

async function buscarDispositivoPorPlaca(
  placa: string,
  opciones?: OpcionesCargaGps,
): Promise<UbicacionGpsMoto | null> {
  const claves = variantesPlaca(placa);
  if (!claves.length) return null;

  const { porPlaca } = await cargarDispositivos(opciones);
  for (const clave of claves) {
    const dispositivo = porPlaca.get(clave);
    if (dispositivo) return dispositivo;
  }
  return null;
}

async function buscarDispositivoPorId(
  deviceId: number,
  opciones?: OpcionesCargaGps,
): Promise<UbicacionGpsMoto | null> {
  if (!Number.isFinite(deviceId) || deviceId <= 0) return null;
  const { porDeviceId } = await cargarDispositivos(opciones);
  return porDeviceId.get(deviceId) ?? null;
}

export type ResultadoBusquedaGps =
  | { ok: true; gps: UbicacionGpsMoto }
  | { ok: false; motivo: "sin_dispositivo" | "error_proveedor" };

export async function buscarUbicacionGps(
  placa: string,
): Promise<ResultadoBusquedaGps> {
  try {
    const dispositivo = await buscarDispositivoPorPlaca(placa);
    if (dispositivo) return { ok: true, gps: dispositivo };
    return { ok: false, motivo: "sin_dispositivo" };
  } catch (e) {
    console.warn("[systemTrackGps]", e instanceof Error ? e.message : e);
    invalidarCachesDispositivos();
    cacheAuth = null;
    return { ok: false, motivo: "error_proveedor" };
  }
}

/** Actualización frecuente para mapa en vivo (GPSWOX get_devices_latest / get_devices). */
export async function buscarUbicacionGpsEnVivo(
  placa: string,
  deviceId?: number,
): Promise<ResultadoBusquedaGps> {
  try {
    const opciones = { enVivo: true as const };
    if (deviceId) {
      const porId = await buscarDispositivoPorId(deviceId, opciones);
      if (porId) return { ok: true, gps: porId };
    }
    const dispositivo = await buscarDispositivoPorPlaca(placa, opciones);
    if (dispositivo) return { ok: true, gps: dispositivo };
    return { ok: false, motivo: "sin_dispositivo" };
  } catch (e) {
    console.warn("[systemTrackGps] en vivo:", e instanceof Error ? e.message : e);
    invalidarCachesDispositivos();
    return { ok: false, motivo: "error_proveedor" };
  }
}

export type ResultadoComandoMotor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

export async function enviarComandoMotor(
  placa: string,
  accion: AccionMotorGps,
): Promise<ResultadoComandoMotor> {
  try {
    const dispositivo = await buscarDispositivoPorPlaca(placa);
    if (!dispositivo) {
      return { ok: false, error: "No se encontró el dispositivo GPS de esa placa." };
    }

    const type = accion === "bloquear" ? "engineStop" : "engineResume";
    const apiHash = await obtenerUserApiHash();

    const res = await fetch(`${SYSTEMTRACK_BASE_URL}/api/send_gprs_command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        user_api_hash: apiHash,
        device_id: dispositivo.deviceId,
        type,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await res.json()) as SendCommandResponse;
    if (data.status === 1) {
      invalidarCachesDispositivos();
      return {
        ok: true,
        mensaje:
          data.message?.trim() ||
          (accion === "bloquear"
            ? "Comando de apagado enviado al GPS."
            : "Comando de encendido enviado al GPS."),
      };
    }

    return {
      ok: false,
      error:
        data.error?.trim() ||
        data.message?.trim() ||
        "System Track no pudo enviar el comando.",
    };
  } catch (e) {
    console.warn("[systemTrackGps] comando:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      error: "No se pudo contactar System Track. Intenta de nuevo.",
    };
  }
}

export function etiquetaEstadoGps(online: string): string {
  switch (online.toLowerCase()) {
    case "online":
      return "En línea";
    case "ack":
      return "Conectado";
    case "offline":
      return "Sin señal";
    default:
      return online || "Desconocido";
  }
}

export function mensajeGpsNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
): string {
  const placaNorm = normalizarPlaca(placa);
  if (motivo === "error_proveedor") {
    return "No se pudo consultar System Track en este momento. Intenta de nuevo en unos segundos.";
  }
  return `La placa ${placaNorm} no aparece en System Track con esta cuenta GPS.`;
}

export function enlaceMapaEmbebido(gps: UbicacionGpsMoto): string {
  const delta = 0.012;
  const bbox = [
    gps.lng - delta,
    gps.lat - delta,
    gps.lng + delta,
    gps.lat + delta,
  ].join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${gps.lat}%2C${gps.lng}`;
}
