import { createHash } from "crypto";

import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import {
  deviceIdDesdeImei,
  type AccionMotorGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

const IOPGPS_BASE_URL =
  process.env.IOPGPS_API_URL?.trim() || "https://open.iopgps.com";
const IOPGPS_APPID = process.env.IOPGPS_APPID?.trim() || "solucionespinilla";
const IOPGPS_SECRET_KEY =
  process.env.IOPGPS_SECRET_KEY?.trim() || "qr5i85fszplr0m149mskasoyx6fqhwei";
const IOPGPS_ACCOUNT =
  process.env.IOPGPS_ACCOUNT?.trim() || IOPGPS_APPID;

const CACHE_TTL_MS = 45_000;
const CACHE_TTL_EN_VIVO_MS = 0;
const AUTH_TTL_MS = 90 * 60_000;

type AuthResponse = {
  code?: number;
  accessToken?: string;
  expiresIn?: number;
  result?: string;
};

type DeviceRow = {
  imei?: string;
  deviceName?: string;
};

type DeviceListResponse = {
  code?: number;
  data?: DeviceRow[];
  page?: { pageSize?: number; currentPage?: number; count?: number };
};

type DeviceStatusRow = {
  imei?: string;
  status?: string;
  lng?: string | number;
  lat?: string | number;
  speed?: number;
  course?: number;
  accStatus?: boolean;
  gpsTime?: number;
  signalTime?: number;
  deviceName?: string;
};

type DeviceStatusResponse = {
  code?: number;
  data?: DeviceStatusRow[];
};

type RelayResponse = {
  code?: number;
  result?: string;
  details?: Array<{ imei?: string; success?: boolean; message?: string }>;
};

let cacheAuth: { token: string; expira: number } | null = null;
let cacheDispositivos: {
  fetchedAt: number;
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
  porImei: Map<string, UbicacionGpsMoto>;
} | null = null;

const PATRON_PLACA_MOTO = /[A-Z]{3}-?\d{2}H?\b/gi;
const PATRON_PLACA_LEGACY = /[A-Z]{3}\d{3}\b/gi;

function md5Lower(texto: string): string {
  return createHash("md5").update(texto, "utf8").digest("hex");
}

function firmarAuth(time: number): string {
  return md5Lower(`${md5Lower(IOPGPS_SECRET_KEY)}${time}`);
}

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

function formatFechaGps(segundos?: number): string {
  if (!segundos || segundos <= 0) return "";
  const d = new Date(segundos * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function mapearEstadoOnline(
  status: string,
  signalTime?: number,
): string {
  const st = status.trim();
  if (st.includes("离线") || st.toLowerCase().includes("offline")) {
    return "offline";
  }
  if (signalTime && signalTime > 0) {
    const hace = Date.now() / 1000 - signalTime;
    if (hace > 900) return "offline";
  }
  if (st.includes("运动") || st.includes("行驶")) return "online";
  return "ack";
}

function mapearDispositivo(
  status: DeviceStatusRow,
  nombre: string,
): UbicacionGpsMoto | null {
  const imei = String(status.imei ?? "").trim();
  const lat = Number(status.lat);
  const lng = Number(status.lng);
  if (!imei || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const speed = Number(status.speed) || 0;
  const course = Number(status.course) || 0;
  const time = formatFechaGps(status.gpsTime) || formatFechaGps(status.signalTime);
  const online = mapearEstadoOnline(String(status.status ?? ""), status.signalTime);

  return {
    proveedor: "iopgps",
    deviceId: deviceIdDesdeImei(imei),
    imei,
    lat,
    lng,
    speed,
    course,
    time,
    online,
    coords: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    bloqueado: false,
    nombreDispositivo: nombre.trim() || imei,
  };
}

async function fetchIop<T>(
  path: string,
  init: RequestInit & { token: string },
): Promise<T> {
  const url = path.startsWith("http") ? path : `${IOPGPS_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      accessToken: init.token,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`IOP GPS respondió ${res.status}`);
  }
  return (await res.json()) as T;
}

async function obtenerAccessToken(force = false): Promise<string> {
  const ahora = Date.now();
  if (!force && cacheAuth && cacheAuth.expira > ahora) {
    return cacheAuth.token;
  }

  const time = Math.floor(ahora / 1000);
  const data = await fetchIop<AuthResponse>("/api/auth", {
    method: "POST",
    token: "",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appid: IOPGPS_APPID,
      time,
      signature: firmarAuth(time),
    }),
  });

  if (data.code !== 0 || !data.accessToken) {
    throw new Error(data.result?.trim() || "No se pudo autenticar en IOP GPS");
  }

  const ttl = Math.min(data.expiresIn ?? 7_200_000, AUTH_TTL_MS) - 60_000;
  cacheAuth = { token: data.accessToken, expira: ahora + Math.max(ttl, 60_000) };
  return data.accessToken;
}

async function listarDispositivos(token: string): Promise<DeviceRow[]> {
  const todos: DeviceRow[] = [];
  let currentPage = 1;
  let total = Infinity;

  while (todos.length < total && currentPage <= 20) {
    const data = await fetchIop<DeviceListResponse>(
      `/api/device?pageSize=100&currentPage=${currentPage}`,
      { method: "GET", token },
    );
    if (data.code !== 0) break;
    const fila = data.data ?? [];
    todos.push(...fila);
    total = data.page?.count ?? todos.length;
    if (fila.length === 0) break;
    currentPage += 1;
  }

  return todos;
}

function indexarDispositivos(
  lista: DeviceRow[],
  estados: DeviceStatusRow[],
): {
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
  porImei: Map<string, UbicacionGpsMoto>;
} {
  const nombrePorImei = new Map<string, string>();
  for (const d of lista) {
    const imei = String(d.imei ?? "").trim();
    if (!imei) continue;
    nombrePorImei.set(imei, String(d.deviceName ?? "").trim());
  }

  const porPlaca = new Map<string, UbicacionGpsMoto>();
  const porDeviceId = new Map<number, UbicacionGpsMoto>();
  const porImei = new Map<string, UbicacionGpsMoto>();

  for (const st of estados) {
    const imei = String(st.imei ?? "").trim();
    const ubicacion = mapearDispositivo(st, nombrePorImei.get(imei) ?? imei);
    if (!ubicacion) continue;

    porImei.set(imei, ubicacion);
    porDeviceId.set(ubicacion.deviceId, ubicacion);

    const placas = extraerPlacasDeTexto(ubicacion.nombreDispositivo);
    for (const placa of placas) {
      const prev = porPlaca.get(placa);
      porPlaca.set(
        placa,
        !prev || ubicacion.time > prev.time ? ubicacion : prev,
      );
    }
  }

  return { porPlaca, porDeviceId, porImei };
}

export function invalidarCacheIopGps(): void {
  cacheDispositivos = null;
}

type OpcionesCargaIop = { enVivo?: boolean };

async function cargarDispositivos(opciones?: OpcionesCargaIop): Promise<{
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
  porImei: Map<string, UbicacionGpsMoto>;
}> {
  const ahora = Date.now();
  const ttl = opciones?.enVivo ? CACHE_TTL_EN_VIVO_MS : CACHE_TTL_MS;

  if (cacheDispositivos && ahora - cacheDispositivos.fetchedAt < ttl) {
    return {
      porPlaca: cacheDispositivos.porPlaca,
      porDeviceId: cacheDispositivos.porDeviceId,
      porImei: cacheDispositivos.porImei,
    };
  }

  const token = await obtenerAccessToken();
  const [lista, statusRes] = await Promise.all([
    listarDispositivos(token),
    fetchIop<DeviceStatusResponse>(
      `/api/device/status?account=${encodeURIComponent(IOPGPS_ACCOUNT)}`,
      { method: "GET", token },
    ),
  ]);

  if (statusRes.code !== 0) {
    throw new Error("IOP GPS no devolvió estados de dispositivos");
  }

  const indexado = indexarDispositivos(lista, statusRes.data ?? []);
  cacheDispositivos = { fetchedAt: ahora, ...indexado };
  return indexado;
}

export type ResultadoBusquedaGps =
  | { ok: true; gps: UbicacionGpsMoto }
  | { ok: false; motivo: "sin_dispositivo" | "error_proveedor" };

async function buscarPorPlaca(
  placa: string,
  opciones?: OpcionesCargaIop,
): Promise<UbicacionGpsMoto | null> {
  const claves = variantesPlaca(placa);
  if (!claves.length) return null;
  const { porPlaca } = await cargarDispositivos(opciones);
  for (const clave of claves) {
    const hit = porPlaca.get(clave);
    if (hit) return hit;
  }
  return null;
}

export async function buscarUbicacionGpsIop(
  placa: string,
): Promise<ResultadoBusquedaGps> {
  try {
    const dispositivo = await buscarPorPlaca(placa);
    if (dispositivo) return { ok: true, gps: dispositivo };
    return { ok: false, motivo: "sin_dispositivo" };
  } catch (e) {
    console.warn("[iopGps]", e instanceof Error ? e.message : e);
    invalidarCacheIopGps();
    cacheAuth = null;
    return { ok: false, motivo: "error_proveedor" };
  }
}

export async function buscarUbicacionGpsIopEnVivo(
  placa: string,
  deviceId?: number,
  imei?: string,
): Promise<ResultadoBusquedaGps> {
  try {
    const opciones = { enVivo: true as const };
    if (imei?.trim()) {
      const { porImei } = await cargarDispositivos(opciones);
      const hit = porImei.get(imei.trim());
      if (hit) return { ok: true, gps: hit };
    }
    if (deviceId && deviceId > 0) {
      const { porDeviceId } = await cargarDispositivos(opciones);
      const hit = porDeviceId.get(deviceId);
      if (hit) return { ok: true, gps: hit };
    }
    const dispositivo = await buscarPorPlaca(placa, opciones);
    if (dispositivo) return { ok: true, gps: dispositivo };
    return { ok: false, motivo: "sin_dispositivo" };
  } catch (e) {
    console.warn("[iopGps] en vivo:", e instanceof Error ? e.message : e);
    invalidarCacheIopGps();
    return { ok: false, motivo: "error_proveedor" };
  }
}

export type ResultadoComandoMotor =
  | { ok: true; mensaje: string }
  | { ok: false; error: string };

export async function enviarComandoMotorIop(
  placa: string,
  accion: AccionMotorGps,
): Promise<ResultadoComandoMotor> {
  try {
    const dispositivo = await buscarPorPlaca(placa);
    if (!dispositivo?.imei) {
      return { ok: false, error: "No se encontró el dispositivo IOP GPS de esa placa." };
    }

    const token = await obtenerAccessToken();
    const parameter = accion === "bloquear" ? "2" : "1";
    const data = await fetchIop<RelayResponse>("/api/instruction/relay", {
      method: "POST",
      token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: 0,
        message: "",
        parameter,
        imeis: [dispositivo.imei],
      }),
    });

    if (data.code === 0) {
      invalidarCacheIopGps();
      return {
        ok: true,
        mensaje:
          data.result?.trim() ||
          (accion === "bloquear"
            ? "Corte de aceite/electricidad enviado (IOP GPS)."
            : "Restablecimiento de aceite/electricidad enviado (IOP GPS)."),
      };
    }

    return {
      ok: false,
      error: data.result?.trim() || "IOP GPS no pudo enviar el comando.",
    };
  } catch (e) {
    console.warn("[iopGps] comando:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      error: "No se pudo contactar IOP GPS. Intenta de nuevo.",
    };
  }
}

export function mensajeGpsIopNoDisponible(
  placa: string,
  motivo: "sin_dispositivo" | "error_proveedor",
): string {
  const placaNorm = normalizarPlaca(placa);
  if (motivo === "error_proveedor") {
    return "No se pudo consultar IOP GPS en este momento. Intenta de nuevo en unos segundos.";
  }
  return `La placa ${placaNorm} no aparece en IOP GPS con la cuenta ${IOPGPS_APPID}.`;
}
