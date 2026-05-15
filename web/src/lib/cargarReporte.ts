import fs from "fs/promises";
import path from "path";
import { unstable_cache } from "next/cache";

import { parseCsvPuntoComa } from "@/lib/csvPlaca";
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
 * 4) Si aún no: DATABASE_URL — misma consulta que db_general.py (sin CSV en Vercel)
 */
async function getFilasReporteSinCache(): Promise<Record<string, string>[]> {
  const csvUrl = process.env.REPORTE_CSV_URL?.trim();
  const csvFallbackUrl = process.env.REPORTE_CSV_FALLBACK_URL?.trim();
  const dbUrl = process.env.DATABASE_URL?.trim();

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

  if (dbUrl) {
    return fetchReporteFilasDesdeDb(dbUrl);
  }

  throw new Error(
    "No hay fuente de datos: el CSV no está en disco, no hay REPORTE_CSV_URL ni DATABASE_URL. " +
      "En Vercel añade DATABASE_URL (mismo string que en tu .env local) o una URL pública al CSV.",
  );
}

/** Cache breve para no leer disco / DB en cada pulsación de búsqueda. */
export const getFilasReporte = unstable_cache(
  getFilasReporteSinCache,
  ["reporte-clientes-filas-v2"],
  { revalidate: 120 },
);
