/**
 * Filtro determinista monto + fecha + hora (± ventana) para cruce extracto ↔ comprobante.
 */

import type { MovimientoExtracto } from "@/lib/pagosExtracto";

export const VENTANA_MINUTOS = 20;

export type OcrConsenso = {
  monto_cop: number;
  fecha: string; // YYYY-MM-DD
  hora: string; // HH:MM:SS o HH:MM
  banco?: string | null;
  referencia?: string | null;
  votos: number;
  total_ocr: number;
};

export function horaAMinutos(hora: string): number | null {
  const m = hora.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function diferenciaMinutos(a: string, b: string): number | null {
  const ma = horaAMinutos(a);
  const mb = horaAMinutos(b);
  if (ma == null || mb == null) return null;
  return Math.abs(ma - mb);
}

export function claveMovimiento(m: MovimientoExtracto): string {
  return m.id;
}

/** Candidatos: mismo monto, misma fecha, hora dentro de ventana; excluye ya usados. */
export function filtrarCandidatos(
  movimientos: MovimientoExtracto[],
  ocr: Pick<OcrConsenso, "monto_cop" | "fecha" | "hora">,
  usados: Set<string> = new Set(),
  ventanaMin = VENTANA_MINUTOS,
): MovimientoExtracto[] {
  const out: Array<{ m: MovimientoExtracto; delta: number }> = [];
  for (const m of movimientos) {
    if (usados.has(claveMovimiento(m))) continue;
    if (m.monto_cop !== ocr.monto_cop) continue;
    if (m.fecha !== ocr.fecha) continue;
    const delta = diferenciaMinutos(m.hora, ocr.hora);
    if (delta == null || delta > ventanaMin) continue;
    out.push({ m, delta });
  }
  out.sort((a, b) => a.delta - b.delta);
  return out.map((x) => x.m);
}

export function marcarUsado(
  usados: Set<string>,
  m: MovimientoExtracto,
): Set<string> {
  const next = new Set(usados);
  next.add(claveMovimiento(m));
  return next;
}
