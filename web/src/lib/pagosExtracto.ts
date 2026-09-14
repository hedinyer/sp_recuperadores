/**
 * Parse extracto Bancolombia (.xlsx) → filas de ingreso para cruce de pagos.
 */

import * as XLSX from "xlsx";

export type MovimientoExtracto = {
  id: string;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM:SS
  monto_cop: number;
  documento: string;
  transaccion: string;
  oficina: string;
  referencia2: string;
  motivo: string;
};

const HEADER_ALIASES: Record<string, string> = {
  "fecha de movimiento": "fecha",
  hora: "hora",
  documento: "documento",
  transacción: "transaccion",
  transaccion: "transaccion",
  "oficina de recaudo": "oficina",
  "valor total": "monto",
  "referencia 2": "referencia2",
  "descripción motivo": "motivo",
  "descripcion motivo": "motivo",
};

function normHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** "$ 40.000,00" | "40000" | 40000 → pesos enteros (centavos descartados). */
export function parseMontoCop(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw);
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Quitar moneda y espacios; formato CO: miles con punto, decimales con coma
  const cleaned = s.replace(/[^\d,.\-]/g, "");
  if (!cleaned) return null;
  let n: number;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    // 40.000,00 → 40000.00
    n = Number(cleaned.replace(/\./g, "").replace(",", "."));
  } else if (cleaned.includes(",")) {
    n = Number(cleaned.replace(",", "."));
  } else {
    n = Number(cleaned.replace(/\./g, ""));
  }
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** "10/09/2026" | "2026-09-10" → YYYY-MM-DD */
export function parseFechaYmd(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel serial date
    const epoch = Date.UTC(1899, 11, 30);
    const d = new Date(epoch + Math.round(raw) * 86400000);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (d < 1 || d > 31 || m < 1 || m > 12) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

/** "23:50:04" | "23:50" → HH:MM:SS */
export function parseHora(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw < 1) {
    // Excel fraction of day
    const totalSec = Math.round(raw * 86400);
    const h = Math.floor(totalSec / 3600) % 24;
    const min = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = m[3] != null ? Number(m[3]) : 0;
  if (h > 23 || min > 59 || sec > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function esIngreso(transaccion: string): boolean {
  const t = transaccion
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return t.includes("nota credito") || t.includes("deposito especial");
}

export function parseExtractoBuffer(buf: ArrayBuffer | Buffer): {
  movimientos: MovimientoExtracto[];
  total_filas: number;
  ingresos: number;
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

  const firstKeys = Object.keys(rows[0] ?? {});
  const colMap: Record<string, string> = {};
  for (const k of firstKeys) {
    const alias = HEADER_ALIASES[normHeader(k)];
    if (alias) colMap[alias] = k;
  }
  if (!colMap.fecha || !colMap.hora || !colMap.monto) {
    throw new Error(
      "Faltan columnas Fecha de Movimiento, Hora o Valor Total. Usa el extracto Bancolombia.",
    );
  }

  const movimientos: MovimientoExtracto[] = [];
  let ingresos = 0;
  rows.forEach((row, i) => {
    const transaccion = String(row[colMap.transaccion ?? ""] ?? "").trim();
    if (!esIngreso(transaccion)) return;
    const fecha = parseFechaYmd(row[colMap.fecha]);
    const hora = parseHora(row[colMap.hora]);
    const monto_cop = parseMontoCop(row[colMap.monto]);
    if (!fecha || !hora || monto_cop == null || monto_cop <= 0) return;
    ingresos += 1;
    const documento = String(row[colMap.documento ?? ""] ?? "").trim() || String(i);
    movimientos.push({
      id: `${documento}|${fecha}|${hora}`,
      fecha,
      hora,
      monto_cop,
      documento,
      transaccion,
      oficina: String(row[colMap.oficina ?? ""] ?? "").trim(),
      referencia2: String(row[colMap.referencia2 ?? ""] ?? "").trim(),
      motivo: String(row[colMap.motivo ?? ""] ?? "").trim(),
    });
  });

  return { movimientos, total_filas: rows.length, ingresos };
}
