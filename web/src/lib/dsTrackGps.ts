import { extraerPlacasDeTexto, variantesPlaca } from "@/lib/placaGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import type {
  AccionMotorGps,
  UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

/** dstrack.uno — API Traccar. */
const DSTRACK_BASE_URL =
  process.env.DSTRACK_API_URL?.trim() || "https://dstrack.uno";
const DSTRACK_USER =
  process.env.DSTRACK_USER?.trim() || "solucionespinilla";
const DSTRACK_PASSWORD =
  process.env.DSTRACK_PASSWORD?.trim() || "SPinilla91222";

const CACHE_TTL_MS = 45_000;
const CACHE_TTL_EN_VIVO_MS = 0;

/** Traccar reporta speed en nudos; la UI muestra km/h. */
const NUDOS_A_KMH = 1.852;

type TraccarDevice = {
  id?: number;
  name?: string;
  uniqueId?: string;
  status?: string;
  lastUpdate?: string | null;
  disabled?: boolean;
};

type TraccarPosition = {
  id?: number;
  deviceId?: number;
  latitude?: number;
  longitude?: number;
  speed?: number;
  course?: number;
  deviceTime?: string;
  fixTime?: string;
  attributes?: Record<string, unknown>;
};

let cacheDispositivos: {
  fetchedAt: number;
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
} | null = null;

function authHeader(): string {
  const token = Buffer.from(`${DSTRACK_USER}:${DSTRACK_PASSWORD}`).toString(
    "base64",
  );
  return `Basic ${token}`;
}

async function traccarGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DSTRACK_BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`DS Track respondió ${res.status}`);
  }
  return (await res.json()) as T;
}

function clavesPlacaDispositivo(device: TraccarDevice): string[] {
  return extraerPlacasDeTexto(String(device.name ?? ""));
}

function leerBloqueo(pos: TraccarPosition | undefined): boolean {
  const blocked = pos?.attributes?.blocked;
  if (typeof blocked === "boolean") return blocked;
  if (blocked != null) {
    return String(blocked).trim().toLowerCase() === "true";
  }
  return false;
}

function formatearTiempo(iso: string | undefined): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("es-CO", { timeZone: "America/Bogota" });
}

function mapearDispositivo(
  device: TraccarDevice,
  pos: TraccarPosition | undefined,
): UbicacionGpsMoto | null {
  const deviceId = Number(device.id);
  if (!Number.isFinite(deviceId) || deviceId <= 0) return null;
  if (device.disabled) return null;

  const lat = Number(pos?.latitude);
  const lng = Number(pos?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  const speedNudos = Number(pos?.speed) || 0;
  const online = String(device.status ?? "").trim().toLowerCase() || "offline";

  return {
    proveedor: "dstrack",
    deviceId,
    imei: String(device.uniqueId ?? "").trim(),
    lat,
    lng,
    speed: speedNudos * NUDOS_A_KMH,
    course: Number(pos?.course) || 0,
    time: formatearTiempo(pos?.deviceTime || pos?.fixTime || device.lastUpdate || undefined),
    online,
    coords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
    bloqueado: leerBloqueo(pos),
    nombreDispositivo: String(device.name ?? "").trim() || "—",
  };
}

function invalidarCachesDispositivos(): void {
  cacheDispositivos = null;
}

function indexar(
  devices: TraccarDevice[],
  positions: TraccarPosition[],
): {
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
} {
  const posPorDevice = new Map<number, TraccarPosition>();
  for (const p of positions) {
    const id = Number(p.deviceId);
    if (Number.isFinite(id) && id > 0) posPorDevice.set(id, p);
  }

  const porPlaca = new Map<string, UbicacionGpsMoto>();
  const porDeviceId = new Map<number, UbicacionGpsMoto>();

  for (const device of devices) {
    const pos = posPorDevice.get(Number(device.id));
    const ubicacion = mapearDispositivo(device, pos);
    if (!ubicacion) continue;

    porDeviceId.set(ubicacion.deviceId, ubicacion);
    for (const clave of clavesPlacaDispositivo(device)) {
      porPlaca.set(clave, ubicacion);
    }
  }

  return { porPlaca, porDeviceId };
}

type OpcionesCargaGps = { enVivo?: boolean };

async function cargarDispositivos(opciones?: OpcionesCargaGps): Promise<{
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

  const [devices, positions] = await Promise.all([
    traccarGet<TraccarDevice[]>("/api/devices"),
    traccarGet<TraccarPosition[]>("/api/positions"),
  ]);

  if (!Array.isArray(devices) || !Array.isArray(positions)) {
    throw new Error("Respuesta inválida de DS Track");
  }

  const indexed = indexar(devices, positions);
  cacheDispositivos = { fetchedAt: ahora, ...indexed };
  return indexed;
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

export async function mapaDispositivosPorPlacaDs(
  opciones?: OpcionesCargaGps,
): Promise<Map<string, UbicacionGpsMoto>> {
  const { porPlaca } = await cargarDispositivos(opciones);
  return porPlaca;
}

export async function buscarUbicacionGpsDs(
  placa: string,
): Promise<ResultadoBusquedaGps> {
  try {
    const dispositivo = await buscarDispositivoPorPlaca(placa);
    if (dispositivo) return { ok: true, gps: dispositivo };
    return { ok: false, motivo: "sin_dispositivo" };
  } catch (e) {
    console.warn("[dsTrackGps]", e instanceof Error ? e.message : e);
    invalidarCachesDispositivos();
    return { ok: false, motivo: "error_proveedor" };
  }
}

export async function buscarUbicacionGpsDsEnVivo(
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
    console.warn("[dsTrackGps] en vivo:", e instanceof Error ? e.message : e);
    invalidarCachesDispositivos();
    return { ok: false, motivo: "error_proveedor" };
  }
}

export type ResultadoComandoMotor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

export async function enviarComandoMotorDs(
  placa: string,
  accion: AccionMotorGps,
): Promise<ResultadoComandoMotor> {
  try {
    const dispositivo = await buscarDispositivoPorPlaca(placa);
    if (!dispositivo) {
      return {
        ok: false,
        error: "No se encontró el dispositivo GPS de esa placa.",
      };
    }

    const type = accion === "bloquear" ? "engineStop" : "engineResume";
    const res = await fetch(`${DSTRACK_BASE_URL}/api/commands/send`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ deviceId: dispositivo.deviceId, type }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error:
          text.trim().slice(0, 200) ||
          "DS Track no pudo enviar el comando.",
      };
    }

    invalidarCachesDispositivos();
    return {
      ok: true,
      mensaje:
        accion === "bloquear"
          ? "Comando de apagado enviado al GPS."
          : "Comando de encendido enviado al GPS.",
    };
  } catch (e) {
    console.warn("[dsTrackGps] comando:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      error: "No se pudo contactar DS Track. Intenta de nuevo.",
    };
  }
}

export function mensajeGpsDsNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
): string {
  const placaNorm = normalizarPlaca(placa);
  if (motivo === "error_proveedor") {
    return "No se pudo consultar DS Track en este momento. Intenta de nuevo en unos segundos.";
  }
  return `La placa ${placaNorm} no aparece en DS Track con esta cuenta GPS.`;
}
