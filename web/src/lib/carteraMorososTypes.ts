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
};
