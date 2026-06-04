import fs from "fs/promises";
import path from "path";

import { parseCsvPuntoComa } from "@/lib/csvPlaca";
import { getDatabaseUrls } from "@/lib/dbUrls";
import { fetchReporteFilasDesdeDb } from "@/lib/reporteFromDb";
import { fetchReporteFilasDesdePython } from "@/lib/reporteFromPython";

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
 * Por defecto: consulta PostgreSQL con algoritmo `client_report` (TypeScript).
 * Si falla o no hay filas: CSV local → REPORTE_CSV_URL → REPORTE_CSV_FALLBACK_URL.
 * REPORTE_CSV_ONLY=1 invierte el orden (útil sin base de datos).
 * CLIENT_REPORT_PYTHON=1 intenta `client_report.py --json` antes del TS.
 */
async function fetchDesdeAlgoritmoExtracto(
  dbUrls: string[],
): Promise<Record<string, string>[]> {
  if (process.env.CLIENT_REPORT_PYTHON === "1") {
    try {
      const filas = await fetchReporteFilasDesdePython();
      if (filas.length > 0) return filas;
    } catch (e) {
      console.warn(
        "[cargarReporte] Python falló, usando TS:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return fetchReporteFilasDesdeDb(dbUrls);
}

async function cargarDesdeCsv(): Promise<Record<string, string>[]> {
  const csvUrl = process.env.REPORTE_CSV_URL?.trim();
  const csvFallbackUrl = process.env.REPORTE_CSV_FALLBACK_URL?.trim();
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

  return [];
}

async function getFilasReporteSinCache(): Promise<Record<string, string>[]> {
  const dbUrls = getDatabaseUrls();
  const soloCsv = process.env.REPORTE_CSV_ONLY === "1";

  if (!soloCsv) {
    try {
      const filasDb = await fetchDesdeAlgoritmoExtracto(dbUrls);
      if (filasDb.length > 0) return filasDb;
    } catch (e) {
      console.warn(
        "[cargarReporte] DB falló, probando CSV:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  const filasCsv = await cargarDesdeCsv();
  if (filasCsv.length > 0) return filasCsv;

  if (soloCsv) {
    return fetchDesdeAlgoritmoExtracto(dbUrls);
  }

  return [];
}

const CACHE_TTL_MS =
  process.env.NODE_ENV === "production" ? 300_000 : 120_000;
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
