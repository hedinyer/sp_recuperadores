/**
 * Cuando el Excel no coincide con el formato Bancolombia “clásico”,
 * Hermes decide el mapeo de columnas y qué filas son ingresos.
 */

import * as XLSX from "xlsx";

import { hermesChatCompletion, parseJsonLoose } from "@/lib/hermesClient";
import {
  esIngreso,
  parseFechaYmd,
  parseHora,
  parseMontoCop,
  type MovimientoExtracto,
} from "@/lib/pagosExtracto";

const AGENT_TIMEOUT_MS = 55_000;

type MapeoAgente = {
  fecha?: string | null;
  hora?: string | null;
  monto?: string | null;
  documento?: string | null;
  transaccion?: string | null;
  oficina?: string | null;
  referencia2?: string | null;
  motivo?: string | null;
  /** Subcadenas (sin acentos) que marcan ingreso/crédito. */
  incluir_si_transaccion_contiene?: string[] | null;
  /** Subcadenas que marcan egreso/débito a excluir. */
  excluir_si_transaccion_contiene?: string[] | null;
};

const SYSTEM_MAPEO = `Eres parser de extractos bancarios colombianos (cualquier banco o exportación).
Te dan los nombres de columnas y filas de ejemplo de un Excel.
Tu trabajo: decidir cómo leer ingresos (créditos/depósitos/pagos recibidos), sin inventar datos.

Responde SOLO JSON:
{
  "fecha": string|null,
  "hora": string|null,
  "monto": string|null,
  "documento": string|null,
  "transaccion": string|null,
  "oficina": string|null,
  "referencia2": string|null,
  "motivo": string|null,
  "incluir_si_transaccion_contiene": string[],
  "excluir_si_transaccion_contiene": string[]
}

Reglas:
- Usa los nombres EXACTOS de las columnas del Excel (copia/pega).
- "fecha" es la columna de fecha del movimiento (p.ej. "Fecha de Movimiento", "Fecha de Sistema", "Fecha").
- "hora" solo si existe columna de hora; si no hay, null.
- "monto" es el valor total del movimiento.
- incluir_si_transaccion_contiene: palabras clave en minúsculas sin tildes que indiquen crédito/ingreso (ej. "nota credito", "deposito", "transferencia recibida").
- excluir_si_transaccion_contiene: palabras de débito/cargo (ej. "nota debito", "gravamen", "iva", "comision").
- Si no hay columna de tipo de transacción, deja incluir/excluir en [] y se tomarán montos positivos.
Solo JSON.`;

function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cell(row: Record<string, unknown>, col: string | null | undefined): unknown {
  if (!col) return "";
  if (col in row) return row[col];
  const want = normKey(col);
  for (const [k, v] of Object.entries(row)) {
    if (normKey(k) === want) return v;
  }
  return "";
}

function sheetRows(buf: ArrayBuffer | Buffer): {
  headers: string[];
  rows: Record<string, unknown>[];
} {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("El Excel no tiene hojas");
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  if (!rows.length) throw new Error("El Excel está vacío");
  return { headers: Object.keys(rows[0] ?? {}), rows };
}

function muestraParaAgente(
  headers: string[],
  rows: Record<string, unknown>[],
): string {
  const sample = rows.slice(0, 8);
  const lines = [
    `Columnas: ${headers.join(" | ")}`,
    `Total filas de datos: ${rows.length}`,
    "Ejemplos:",
  ];
  for (const [i, row] of sample.entries()) {
    const cells = headers.map((h) => `${h}=${String(row[h] ?? "").slice(0, 80)}`);
    lines.push(`${i + 1}. ${cells.join(" · ")}`);
  }
  return lines.join("\n");
}

function esIngresoSegunMapeo(
  transaccion: string,
  mapeo: MapeoAgente,
): boolean {
  const t = normKey(transaccion);
  const excluir = (mapeo.excluir_si_transaccion_contiene ?? []).map(normKey);
  const incluir = (mapeo.incluir_si_transaccion_contiene ?? []).map(normKey);

  if (excluir.some((k) => k && t.includes(k))) return false;
  if (incluir.length > 0) {
    return incluir.some((k) => k && t.includes(k));
  }
  if (t) return esIngreso(transaccion);
  // Sin tipo de transacción: aceptar montos positivos (el filtro de monto ya aplica)
  return true;
}

function aplicarMapeo(
  rows: Record<string, unknown>[],
  mapeo: MapeoAgente,
): MovimientoExtracto[] {
  if (!mapeo.fecha || !mapeo.monto) {
    throw new Error("Hermes no identificó columnas de fecha y monto en el Excel");
  }

  const movimientos: MovimientoExtracto[] = [];
  rows.forEach((row, i) => {
    const transaccion = String(cell(row, mapeo.transaccion) ?? "").trim();
    if (!esIngresoSegunMapeo(transaccion, mapeo)) return;

    const fecha = parseFechaYmd(cell(row, mapeo.fecha));
    const monto_cop = parseMontoCop(cell(row, mapeo.monto));
    if (!fecha || monto_cop == null || monto_cop <= 0) return;

    const horaRaw = mapeo.hora ? parseHora(cell(row, mapeo.hora)) : null;
    const hora = horaRaw ?? "";
    const documento =
      String(cell(row, mapeo.documento) ?? "").trim() || String(i);

    movimientos.push({
      id: `${documento}|${fecha}|${hora || "sin-hora"}`,
      fecha,
      hora,
      monto_cop,
      documento,
      transaccion,
      oficina: String(cell(row, mapeo.oficina) ?? "").trim(),
      referencia2: String(cell(row, mapeo.referencia2) ?? "").trim(),
      motivo: String(cell(row, mapeo.motivo) ?? "").trim(),
    });
  });

  return movimientos;
}

/** Hermes interpreta el formato del Excel y extrae ingresos. */
export async function parseExtractoConAgente(
  buf: ArrayBuffer | Buffer,
): Promise<{
  movimientos: MovimientoExtracto[];
  total_filas: number;
  ingresos: number;
  via: "agente";
  sin_hora: boolean;
  mapeo: MapeoAgente;
}> {
  const { headers, rows } = sheetRows(buf);
  const raw = await hermesChatCompletion({
    messages: [
      { role: "system", content: SYSTEM_MAPEO },
      { role: "user", content: muestraParaAgente(headers, rows) },
    ],
    temperature: 0.1,
    timeoutMs: AGENT_TIMEOUT_MS,
  });

  const mapeo = parseJsonLoose<MapeoAgente>(raw);
  const movimientos = aplicarMapeo(rows, mapeo);
  if (!movimientos.length) {
    throw new Error(
      "Hermes leyó el Excel pero no encontró ingresos (créditos/depósitos)",
    );
  }

  return {
    movimientos,
    total_filas: rows.length,
    ingresos: movimientos.length,
    via: "agente",
    sin_hora: !mapeo.hora,
    mapeo,
  };
}
