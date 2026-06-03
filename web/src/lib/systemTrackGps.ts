import { normalizarPlaca } from "@/lib/syncPlacaEstado";

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
const AUTH_TTL_MS = 25 * 60_000;

export type UbicacionGpsMoto = {
  lat: number;
  lng: number;
  speed: number;
  course: number;
  time: string;
  online: string;
  coords: string;
};

type GpsDeviceItem = {
  lat?: number;
  lng?: number;
  speed?: number;
  course?: number;
  time?: string;
  online?: string;
  name?: string;
  device_data?: { plate_number?: string };
};

type GpsDeviceGroup = {
  items?: GpsDeviceItem[];
};

type LoginResponse = {
  status?: number;
  user_api_hash?: string;
};

let cacheDispositivos: { fetchedAt: number; porPlaca: Map<string, UbicacionGpsMoto> } | null =
  null;
let cacheAuth: { hash: string; fetchedAt: number } | null = null;

/** Placas moto: MCR33H, MCR-33H, MCY-94H */
const PATRON_PLACA_MOTO = /[A-Z]{3}-?\d{2}H?\b/gi;
/** Placas antiguas en System Track: SQF242, LKN307 */
const PATRON_PLACA_LEGACY = /[A-Z]{3}\d{3}\b/gi;

function variantesPlaca(placa: string): string[] {
  const norm = normalizarPlaca(placa);
  if (!norm) return [];

  const variantes = new Set<string>([norm]);
  if (/^[A-Z]{3}\d{2}H$/.test(norm)) {
    variantes.add(norm.slice(0, -1));
  } else if (/^[A-Z]{3}\d{2}$/.test(norm)) {
    variantes.add(`${norm}H`);
  }
  return [...variantes];
}

function registrarPlaca(claves: Set<string>, placaRaw: string): void {
  const limpia = placaRaw.trim();
  if (!limpia) return;
  for (const variante of variantesPlaca(limpia)) {
    claves.add(variante);
  }
}

function extraerPlacasDeTexto(texto: string): string[] {
  const raw = String(texto ?? "");
  const encontradas = new Set<string>();

  for (const match of raw.matchAll(PATRON_PLACA_MOTO)) {
    registrarPlaca(encontradas, match[0]);
  }
  for (const match of raw.matchAll(PATRON_PLACA_LEGACY)) {
    registrarPlaca(encontradas, match[0]);
  }

  const primero = raw.trim().split(/\s+/)[0] ?? "";
  if (/^[A-Z]{3}-?\d{2,3}H?$/i.test(primero)) {
    registrarPlaca(encontradas, primero);
  }

  return [...encontradas];
}

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

function mapearDispositivo(item: GpsDeviceItem): UbicacionGpsMoto | null {
  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;

  return {
    lat,
    lng,
    speed: Number(item.speed) || 0,
    course: Number(item.course) || 0,
    time: String(item.time ?? "").trim() || "—",
    online: String(item.online ?? "").trim() || "offline",
    coords: `${lat.toFixed(6)},${lng.toFixed(6)}`,
  };
}

function invalidarCachesDispositivos(): void {
  cacheDispositivos = null;
}

async function obtenerUserApiHash(force = false): Promise<string> {
  const ahora = Date.now();
  if (
    !force &&
    cacheAuth &&
    ahora - cacheAuth.fetchedAt < AUTH_TTL_MS
  ) {
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

async function cargarDispositivosPorPlaca(): Promise<Map<string, UbicacionGpsMoto>> {
  const ahora = Date.now();
  if (cacheDispositivos && ahora - cacheDispositivos.fetchedAt < CACHE_TTL_MS) {
    return cacheDispositivos.porPlaca;
  }

  let apiHash = await obtenerUserApiHash();
  let data = await fetchDispositivos(apiHash);

  let totalItems = data.reduce((n, g) => n + (g.items?.length ?? 0), 0);
  if (totalItems <= 10) {
    invalidarCachesDispositivos();
    apiHash = await obtenerUserApiHash(true);
    data = await fetchDispositivos(apiHash);
    totalItems = data.reduce((n, g) => n + (g.items?.length ?? 0), 0);
  }

  const porPlaca = new Map<string, UbicacionGpsMoto>();
  for (const grupo of data) {
    for (const item of grupo.items ?? []) {
      const ubicacion = mapearDispositivo(item);
      if (!ubicacion) continue;
      for (const clave of clavesPlacaDispositivo(item)) {
        porPlaca.set(clave, ubicacion);
      }
    }
  }

  cacheDispositivos = { fetchedAt: ahora, porPlaca };
  return porPlaca;
}

export type ResultadoBusquedaGps =
  | { ok: true; gps: UbicacionGpsMoto }
  | { ok: false; motivo: "sin_dispositivo" | "error_proveedor" };

/** Busca la ubicación GPS en System Track por placa (plate_number). */
export async function buscarUbicacionGps(
  placa: string,
): Promise<ResultadoBusquedaGps> {
  const claves = variantesPlaca(placa);
  if (!claves.length) return { ok: false, motivo: "sin_dispositivo" };

  try {
    const dispositivos = await cargarDispositivosPorPlaca();
    for (const clave of claves) {
      const gps = dispositivos.get(clave);
      if (gps) return { ok: true, gps };
    }
    return { ok: false, motivo: "sin_dispositivo" };
  } catch (e) {
    console.warn("[systemTrackGps]", e instanceof Error ? e.message : e);
    invalidarCachesDispositivos();
    cacheAuth = null;
    return { ok: false, motivo: "error_proveedor" };
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

export function esProveedorSystemTrack(gpsMoto: string | null | undefined): boolean {
  return String(gpsMoto ?? "")
    .trim()
    .toLowerCase()
    .includes("system track");
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
