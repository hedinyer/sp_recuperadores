import type { EstadoGpsPlaca } from "@/lib/gpsEstadoPlacas";
import type { CategoriaMoroso } from "@/lib/categoriasMorosos";
import type { CarteraStatus } from "@/lib/carteraPerfiles";

export type CasoCartera = {
  placa: string;
  perfil_id: string | null;
  categoria: string | null;
  status: CarteraStatus | string;
  notas: string | null;
  updated_at: string | null;
};

export type GestionCartera = {
  id?: number;
  placa: string;
  perfil_id: string;
  status: string;
  notas: string | null;
  created_at: string;
  monto?: number | null;
};

export type MorosoBandeja = {
  placa: string;
  cedula: string;
  nombre: string;
  telefono: string;
  visitador: string;
  fecha_inicio: string;
  valor_cuota: number;
  deuda_total: number;
  dias_mora: number;
  cuotas_pendientes: number;
  cumplimiento_pct: number;
  total_pagado: number;
  ultimo_pago: string;
  pago_hoy: boolean;
  categoria: CategoriaMoroso;
  gps: EstadoGpsPlaca;
  caso: CasoCartera | null;
  gestiones: GestionCartera[];
  n_gestiones: number;
};

export function conteoGestiones(
  moto: Pick<MorosoBandeja, "gestiones" | "n_gestiones">,
): number {
  return moto.n_gestiones ?? moto.gestiones?.length ?? 0;
}

/** Inicio del día en Bogotá (UTC-5). */
export function inicioDiaBogotaMs(ahora = Date.now()): number {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ahora));
  return new Date(`${day}T00:00:00-05:00`).getTime();
}

/** Última gestión de hoy hecha por ese perfil. Sin perfil → ninguna. */
export function ultimaGestionHoy(
  gestiones: GestionCartera[] | undefined,
  perfilId?: string | null,
): string | null {
  if (!gestiones?.length || !perfilId) return null;
  const desde = inicioDiaBogotaMs();
  for (const g of gestiones) {
    if (g.perfil_id !== perfilId) continue;
    const t = new Date(g.created_at).getTime();
    if (Number.isNaN(t) || t < desde) continue;
    return g.created_at;
  }
  return null;
}

export function gestionReciente(
  gestiones: GestionCartera[] | undefined,
  perfilId?: string | null,
): boolean {
  return ultimaGestionHoy(gestiones, perfilId) != null;
}

/** Chulito (gestión de hoy del perfil) primero; el resto por deuda. */
export function compararMorososBandeja(
  a: MorosoBandeja,
  b: MorosoBandeja,
  perfilId?: string | null,
): number {
  const ca = gestionReciente(a.gestiones, perfilId) ? 0 : 1;
  const cb = gestionReciente(b.gestiones, perfilId) ? 0 : 1;
  if (ca !== cb) return ca - cb;
  return b.deuda_total - a.deuda_total;
}
