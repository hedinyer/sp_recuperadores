import { etiquetaCarteraStatus, nombrePerfilCartera } from "@/lib/carteraPerfiles";
import { formatearCOP } from "@/lib/formatoDinero";

export const PERFILES_KPI = ["dayana", "jhon_saenz"] as const;

export type PerfilKpiId = (typeof PERFILES_KPI)[number];

export type PerfilKpi = {
  id: PerfilKpiId;
  nombre: string;
  motos_hoy: number;
  estados_hoy: number;
  recaudado_hoy: number;
  por_status: Array<{ id: string; label: string; n: number }>;
  ultima_at: string | null;
};

export type FilaGestionKpi = {
  perfil_id: string;
  status: string;
  placa: string;
  created_at: string;
  notas?: string | null;
  monto?: number | null;
};

/** Monto de un abono: columna monto o notas `pago:123456`. */
export function montoDesdeGestion(fila: {
  status: string;
  notas?: string | null;
  monto?: number | null;
}): number {
  if (typeof fila.monto === "number" && Number.isFinite(fila.monto) && fila.monto > 0) {
    return Math.round(fila.monto);
  }
  if (fila.status !== "abono") return 0;
  const raw = String(fila.notas ?? "");
  const m = raw.match(/pago:\s*(\d+)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function notaConMontoPago(
  monto: number,
  notaExtra?: string | null,
): string {
  const base = `pago:${Math.round(monto)}`;
  const extra = String(notaExtra ?? "").trim();
  return extra ? `${base} ${extra.slice(0, 400)}` : base;
}

export function isoInicioDiaBogota(ahora = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  return new Date(`${day}T00:00:00-05:00`).toISOString();
}

export function kpisDesdeGestiones(filas: FilaGestionKpi[]): {
  kpis: PerfilKpi[];
  recaudado_equipo: number;
} {
  const kpis = PERFILES_KPI.map((id) => {
    const mias = filas.filter((f) => f.perfil_id === id);
    const motos = new Set(mias.map((f) => f.placa));
    const conteo = new Map<string, number>();
    let recaudado_hoy = 0;
    for (const f of mias) {
      conteo.set(f.status, (conteo.get(f.status) ?? 0) + 1);
      recaudado_hoy += montoDesdeGestion(f);
    }
    const por_status = [...conteo.entries()]
      .map(([status, n]) => ({
        id: status,
        label: etiquetaCarteraStatus(status),
        n,
      }))
      .sort((a, b) => b.n - a.n);
    return {
      id,
      nombre: nombrePerfilCartera(id),
      motos_hoy: motos.size,
      estados_hoy: mias.length,
      recaudado_hoy,
      por_status,
      ultima_at: mias[0]?.created_at ?? null,
    };
  });
  const recaudado_equipo = kpis.reduce((s, k) => s + k.recaudado_hoy, 0);
  return { kpis, recaudado_equipo };
}

export function etiquetaRecaudado(n: number): string {
  return formatearCOP(n);
}
