import fs from "fs/promises";
import path from "path";

import { parseCsvPuntoComa } from "@/lib/csvPlaca";
import { DATABASE_URL_DEFAULT } from "@/lib/dbDefaults";
import { fetchReporteFilasDesdeDb } from "@/lib/reporteFromDb";

function isEnoent(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function defaultLocalCsvPath(): string {
  return path.join(process.cwd(), "..", "data", "reporte_clientes_actual.csv");
}

async function fetchCsvTextoDesdeUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    next: { revalidate: 120 },
    headers: { Accept: "text/csv,text/plain,*/*" },
  });
  if (!res.ok) {
    throw new Error(`No se pudo descargar el CSV (${res.status})`);
  }
  return res.text();
}

/**
 * 1) Archivo local (REPORTE_CSV_PATH o data/reporte… junto al monorepo)
 * 2) Si no existe: REPORTE_CSV_URL (descarga)
 * 3) Si sigue sin datos: REPORTE_CSV_FALLBACK_URL
 * 4) Consulta directa con DATABASE_URL (misma SQL que db_general.py); si falta el env,
 *    se usa la cadena embebida en `src/lib/dbDefaults.ts`.
 */
async function getFilasReporteSinCache(): Promise<Record<string, string>[]> {
  const csvUrl = process.env.REPORTE_CSV_URL?.trim();
  const csvFallbackUrl = process.env.REPORTE_CSV_FALLBACK_URL?.trim();
  const dbUrl =
    process.env.DATABASE_URL?.trim() || DATABASE_URL_DEFAULT;

  const filePath =
    process.env.REPORTE_CSV_PATH?.trim() || defaultLocalCsvPath();

  let raw: string | null = null;
  try {
    raw = await fs.readFile(filePath, "utf-8");
  } catch (e) {
    if (!isEnoent(e)) throw e;
  }

  if (raw !== null) {
    const filas = parseCsvPuntoComa(raw);
    if (filas.length > 0) return filas;
  }

  if (csvUrl) {
    const t = await fetchCsvTextoDesdeUrl(csvUrl);
    const filas = parseCsvPuntoComa(t);
    if (filas.length > 0) return filas;
  }

  if (csvFallbackUrl) {
    const t = await fetchCsvTextoDesdeUrl(csvFallbackUrl);
    const filas = parseCsvPuntoComa(t);
    if (filas.length > 0) return filas;
  }

  return fetchReporteFilasDesdeDb(dbUrl);
}

const CACHE_TTL_MS = 120_000;
let cacheMemoria: {
  filas: Record<string, string>[];
  expira: number;
} | null = null;

/** Cache en memoria (el reporte supera el límite de 2MB de `unstable_cache`). */
export async function getFilasReporte(): Promise<Record<string, string>[]> {
  const ahora = Date.now();
  if (cacheMemoria && cacheMemoria.expira > ahora) {
    return cacheMemoria.filas;
  }
  const filas = await getFilasReporteSinCache();
  cacheMemoria = { filas, expira: ahora + CACHE_TTL_MS };
  return filas;
}
