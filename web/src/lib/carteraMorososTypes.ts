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
};

export const GESTION_RECIENTE_MS = 12 * 60 * 60 * 1000;

export function gestionReciente(updatedAt: string | null | undefined): boolean {
  if (!updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < GESTION_RECIENTE_MS;
}

/** Chulito primero; el resto por deuda de mayor a menor. */
export function compararMorososBandeja(
  a: MorosoBandeja,
  b: MorosoBandeja,
): number {
  const ca = gestionReciente(a.caso?.updated_at) ? 0 : 1;
  const cb = gestionReciente(b.caso?.updated_at) ? 0 : 1;
  if (ca !== cb) return ca - cb;
  return b.deuda_total - a.deuda_total;
}
