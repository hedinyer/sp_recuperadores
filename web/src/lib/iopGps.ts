import { createHash } from "crypto";

import { extraerPlacasDeTexto, variantesPlaca } from "@/lib/placaGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import {
  deviceIdDesdeImei,
  type AccionMotorGps,
  type UbicacionGpsMoto,
} from "@/lib/ubicacionGps";

const IOPGPS_BASE_URL =
  process.env.IOPGPS_API_URL?.trim() || "https://open.iopgps.com";

type CuentaIop = {
  appid: string;
  secretKey: string;
};

const CUENTAS_IOP_DEFECTO: CuentaIop[] = [
  {
    appid: "solucionespinilla",
    secretKey: "qr5i85fszplr0m149mskasoyx6fqhwei",
  },
  {
    appid: "berala37",
    secretKey: "q16guj78wwkxqjh2r7o833qj920rgve0",
  },
  {
    appid: "all4motosbera",
    secretKey: "tc1z9k9volktkclrz1c6tsh0m2emni7w",
  },
];

function parseCuentasIopEnv(): CuentaIop[] {
  const raw = process.env.IOPGPS_CUENTAS_JSON?.trim();
  if (!raw) return CUENTAS_IOP_DEFECTO;
  try {
    const parsed = JSON.parse(raw) as CuentaIop[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.filter((c) => c.appid && c.secretKey);
    }
  } catch {
    console.warn("[iopGps] IOPGPS_CUENTAS_JSON inválido, usando cuentas por defecto");
  }
  return CUENTAS_IOP_DEFECTO;
}

const CUENTAS_IOP = parseCuentasIopEnv();

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

const cacheAuthPorCuenta = new Map<string, { token: string; expira: number }>();
let cacheDispositivos: {
  fetchedAt: number;
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
  porImei: Map<string, UbicacionGpsMoto>;
} | null = null;

function md5Lower(texto: string): string {
  return createHash("md5").update(texto, "utf8").digest("hex");
}

function firmarAuth(time: number, secretKey: string): string {
  return md5Lower(`${md5Lower(secretKey)}${time}`);
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

function mapearEstadoOnline(status: string, signalTime?: number): string {
  const st = status.trim();
  if (st.includes("离线") || st.toLowerCase().includes("offline")) {
    return "offline";
  }
  if (signalTime && signalTime > 0) {
    const hace = Date.now() / 1000 - signalTime;
    if (hace > 86_400) return "offline"; // >24 h sin señal
  }
  if (st.includes("运动") || st.includes("行驶")) return "online";
  return "ack";
}

function mapearDispositivo(
  status: DeviceStatusRow,
  nombre: string,
  cuenta: string,
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
    iopCuenta: cuenta,
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

async function obtenerAccessToken(
  cuenta: CuentaIop,
  force = false,
): Promise<string> {
  const ahora = Date.now();
  const cache = cacheAuthPorCuenta.get(cuenta.appid);
  if (!force && cache && cache.expira > ahora) {
    return cache.token;
  }

  const time = Math.floor(ahora / 1000);
  const data = await fetchIop<AuthResponse>("/api/auth", {
    method: "POST",
    token: "",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appid: cuenta.appid,
      time,
      signature: firmarAuth(time, cuenta.secretKey),
    }),
  });

  if (data.code !== 0 || !data.accessToken) {
    throw new Error(
      data.result?.trim() || `No se pudo autenticar IOP GPS (${cuenta.appid})`,
    );
  }

  const ttl = Math.min(data.expiresIn ?? 7_200_000, AUTH_TTL_MS) - 60_000;
  cacheAuthPorCuenta.set(cuenta.appid, {
    token: data.accessToken,
    expira: ahora + Math.max(ttl, 60_000),
  });
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

function fusionarUbicacion(
  map: Map<string, UbicacionGpsMoto>,
  placa: string,
  ubicacion: UbicacionGpsMoto,
): void {
  const prev = map.get(placa);
  if (!prev || ubicacion.time >= prev.time) {
    map.set(placa, ubicacion);
  }
}

function indexarDispositivos(
  lista: DeviceRow[],
  estados: DeviceStatusRow[],
  cuenta: string,
  destino: {
    porPlaca: Map<string, UbicacionGpsMoto>;
    porDeviceId: Map<number, UbicacionGpsMoto>;
    porImei: Map<string, UbicacionGpsMoto>;
  },
): void {
  const nombrePorImei = new Map<string, string>();
  for (const d of lista) {
    const imei = String(d.imei ?? "").trim();
    if (!imei) continue;
    nombrePorImei.set(imei, String(d.deviceName ?? "").trim());
  }

  for (const st of estados) {
    const imei = String(st.imei ?? "").trim();
    const ubicacion = mapearDispositivo(
      st,
      nombrePorImei.get(imei) ?? imei,
      cuenta,
    );
    if (!ubicacion) continue;

    destino.porImei.set(imei, ubicacion);
    destino.porDeviceId.set(ubicacion.deviceId, ubicacion);

    for (const placa of extraerPlacasDeTexto(ubicacion.nombreDispositivo)) {
      fusionarUbicacion(destino.porPlaca, placa, ubicacion);
    }
  }
}

async function cargarCuentaIop(cuenta: CuentaIop): Promise<{
  porPlaca: Map<string, UbicacionGpsMoto>;
  porDeviceId: Map<number, UbicacionGpsMoto>;
  porImei: Map<string, UbicacionGpsMoto>;
}> {
  const token = await obtenerAccessToken(cuenta);
  const [lista, statusRes] = await Promise.all([
    listarDispositivos(token),
    fetchIop<DeviceStatusResponse>(
      `/api/device/status?account=${encodeURIComponent(cuenta.appid)}`,
      { method: "GET", token },
    ),
  ]);

  const destino = {
    porPlaca: new Map<string, UbicacionGpsMoto>(),
    porDeviceId: new Map<number, UbicacionGpsMoto>(),
    porImei: new Map<string, UbicacionGpsMoto>(),
  };

  if (statusRes.code === 0) {
    indexarDispositivos(lista, statusRes.data ?? [], cuenta.appid, destino);
  }

  return destino;
}

export function invalidarCacheIopGps(): void {
  cacheDispositivos = null;
  cacheAuthPorCuenta.clear();
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

  const porPlaca = new Map<string, UbicacionGpsMoto>();
  const porDeviceId = new Map<number, UbicacionGpsMoto>();
  const porImei = new Map<string, UbicacionGpsMoto>();

  const resultados = await Promise.allSettled(
    CUENTAS_IOP.map((cuenta) => cargarCuentaIop(cuenta)),
  );

  let algunaOk = false;
  for (const r of resultados) {
    if (r.status !== "fulfilled") {
      console.warn(
        "[iopGps] cuenta falló:",
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
      continue;
    }
    algunaOk = true;
    for (const [placa, u] of r.value.porPlaca) {
      fusionarUbicacion(porPlaca, placa, u);
    }
    for (const [id, u] of r.value.porDeviceId) {
      const prev = porDeviceId.get(id);
      if (!prev || u.time >= prev.time) porDeviceId.set(id, u);
    }
    for (const [imei, u] of r.value.porImei) {
      const prev = porImei.get(imei);
      if (!prev || u.time >= prev.time) porImei.set(imei, u);
    }
  }

  if (!algunaOk) {
    throw new Error("No se pudo consultar ninguna cuenta IOP GPS");
  }

  cacheDispositivos = {
    fetchedAt: ahora,
    porPlaca,
    porDeviceId,
    porImei,
  };
  return cacheDispositivos;
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

function cuentaPorAppid(appid: string): CuentaIop | undefined {
  return CUENTAS_IOP.find((c) => c.appid === appid);
}

export async function mapaDispositivosPorPlacaIop(
  opciones?: OpcionesCargaIop,
): Promise<Map<string, UbicacionGpsMoto>> {
  const { porPlaca } = await cargarDispositivos(opciones);
  return porPlaca;
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

    const cuenta = cuentaPorAppid(dispositivo.iopCuenta ?? "") ?? CUENTAS_IOP[0];
    const token = await obtenerAccessToken(cuenta);
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
            ? `Corte enviado (IOP GPS · ${cuenta.appid}).`
            : `Restablecimiento enviado (IOP GPS · ${cuenta.appid}).`),
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
  const cuentas = CUENTAS_IOP.map((c) => c.appid).join(", ");
  return `La placa ${placaNorm} no aparece en IOP GPS (cuentas: ${cuentas}).`;
}

export function cuentasIopConfiguradas(): string[] {
  return CUENTAS_IOP.map((c) => c.appid);
}
