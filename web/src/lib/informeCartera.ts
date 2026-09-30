/**
 * Cálculo canónico de /informe-cartera.
 * Solo motos cobrables (contrato + vehículo Activo). Días congelados
 * no generan cuota ni mora (eso vive en extractoCliente).
 */

import { placaExcluidaDeReportes } from "@/lib/placasExcluidasReportes";
import { variantesPlaca } from "@/lib/placaGps";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import type { UbicacionGpsMoto } from "@/lib/ubicacionGps";

export type ZonaErpId = "santander" | "bogota_chia";
export type ZonaId = ZonaErpId | "calle_80" | "girardot";
export type BucketMora = "alDia" | "mora1a7" | "moraMas7";

export type ZonaTotales = {
  motos: number;
  cartera: number;
  alDia: number;
  mora1a7: number;
  moraMas7: number;
};

export type InformeCarteraCorte = {
  corte: string;
  corte_ymd: string;
  taller: number;
  zonas: Record<ZonaId, ZonaTotales>;
};

export const BUCARAMANGA = { lat: 7.119, lng: -73.122 };
export const CHIA = { lat: 4.861, lng: -74.05 };
export const SANTANDER_KM = 150;
export const CHIA_KM = 8;

const ESTADOS_ACTIVOS = new Set(["activo", "activa"]);

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const BOGOTA_FIN = /bogot[aá]\s*$/i;
const BOGOTA_TXT = /bogot[aá]/i;
const CHIA_TXT = /ch[ií]a/i;

export function hoyBogotaYmd(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

export function etiquetaCorte(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${d} de ${MESES_ES[m - 1]} de ${y}`;
}

function normEstado(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase();
}

/** Contrato y moto tienen que estar Activos. Retenido / inactivo / vitrina fuera. */
export function esCarteraInformeActiva(
  estadoContrato: string | null | undefined,
  estadoVehiculo: string | null | undefined,
): boolean {
  return (
    ESTADOS_ACTIVOS.has(normEstado(estadoContrato)) &&
    ESTADOS_ACTIVOS.has(normEstado(estadoVehiculo))
  );
}

export function esPlacaInforme(placa: string | null | undefined): boolean {
  const key = normalizarPlaca(placa ?? "");
  return key !== "" && !placaExcluidaDeReportes(key);
}

/** Marca una placa y sus variantes (ABC12H / ABC12) para no contarla dos veces. */
export function registrarPlacas(
  set: Set<string>,
  placa: string | null | undefined,
): void {
  for (const clave of variantesPlaca(placa ?? "")) set.add(clave);
}

export function placaYaContada(
  placa: string | null | undefined,
  set: Set<string>,
): boolean {
  return variantesPlaca(placa ?? "").some((clave) => set.has(clave));
}

/** Al día = sin atraso o sin deuda. Luego 1–7 y más de 7. */
export function bucketMora(diasMora: number, deuda: number): BucketMora {
  if (diasMora <= 0 || deuda <= 0) return "alDia";
  if (diasMora <= 7) return "mora1a7";
  return "moraMas7";
}

export function zonaVacia(): ZonaTotales {
  return { motos: 0, cartera: 0, alDia: 0, mora1a7: 0, moraMas7: 0 };
}

export function zonasVacias(): Record<ZonaId, ZonaTotales> {
  return {
    santander: zonaVacia(),
    bogota_chia: zonaVacia(),
    calle_80: zonaVacia(),
    girardot: zonaVacia(),
  };
}

export function sumarMoto(z: ZonaTotales, deuda: number, bucket: BucketMora): void {
  z.motos += 1;
  z.cartera += deuda;
  z[bucket] += 1;
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dlat = lat2 - lat1;
  const dlon = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function posicionGpsPlaca(
  placa: string,
  mapa: Map<string, UbicacionGpsMoto>,
): { lat: number; lng: number } | null {
  for (const clave of variantesPlaca(placa)) {
    const hit = mapa.get(clave);
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
      if (Math.abs(hit.lat) < 0.5 && Math.abs(hit.lng) < 0.5) continue;
      return { lat: hit.lat, lng: hit.lng };
    }
  }
  return null;
}

export function clasificarZonaErp(input: {
  nombre: string;
  direccion?: string | null;
  pos?: { lat: number; lng: number } | null;
}): ZonaErpId {
  const nombre = input.nombre ?? "";
  const direccion = input.direccion ?? "";
  const diLow = direccion.toLowerCase();
  const esChiaTxt = Boolean(
    CHIA_TXT.test(nombre) || (CHIA_TXT.test(direccion) && !diLow.includes("soacha")),
  );
  const esBogTxt = Boolean(
    BOGOTA_FIN.test(nombre.trim()) || BOGOTA_TXT.test(direccion),
  );
  const pos = input.pos ?? null;
  const esChiaGps = pos != null && haversineKm(pos, CHIA) <= CHIA_KM;
  const esLejosBga = pos != null && haversineKm(pos, BUCARAMANGA) > SANTANDER_KM;
  if (esChiaGps || esLejosBga || esChiaTxt || esBogTxt) return "bogota_chia";
  return "santander";
}

export function esCompraSpEnCalle(
  estado: string | null | undefined,
  estadoFisico: string | null | undefined,
): boolean {
  if (String(estado ?? "").trim().toLowerCase() !== "entregada") return false;
  const fisico = String(estadoFisico ?? "activa")
    .trim()
    .toLowerCase();
  return fisico === "activa" || fisico === "en_transito" || fisico === "";
}

export function armarCorte(input: {
  ymd: string;
  taller: number;
  zonas: Record<ZonaId, ZonaTotales>;
}): InformeCarteraCorte {
  return {
    corte: etiquetaCorte(input.ymd),
    corte_ymd: input.ymd,
    taller: Math.round(input.taller),
    zonas: input.zonas,
  };
}

export function totalesInforme(zonas: Record<ZonaId, ZonaTotales>): {
  motos: number;
  cartera: number;
  alDia: number;
  mora1a7: number;
  moraMas7: number;
} {
  const ids: ZonaId[] = ["santander", "bogota_chia", "calle_80", "girardot"];
  return ids.reduce(
    (acc, id) => {
      const z = zonas[id];
      acc.motos += z.motos;
      acc.cartera += z.cartera;
      acc.alDia += z.alDia;
      acc.mora1a7 += z.mora1a7;
      acc.moraMas7 += z.moraMas7;
      return acc;
    },
    { motos: 0, cartera: 0, alDia: 0, mora1a7: 0, moraMas7: 0 },
  );
}
