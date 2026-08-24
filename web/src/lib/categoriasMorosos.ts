import type { EstadoGpsPlaca } from "@/lib/gpsEstadoPlacas";

export type CategoriaMoroso =
  | "bajo_pago"
  | "sin_gps"
  | "mora_15"
  | "mora_4_15";

export const CATEGORIAS_MOROSO: Array<{
  id: CategoriaMoroso;
  label: string;
  descripcion: string;
}> = [
  {
    id: "bajo_pago",
    label: "Bajo pago",
    descripcion: "Sin pagos o menos del 20% de las cuotas esperadas",
  },
  {
    id: "sin_gps",
    label: "Sin GPS",
    descripcion: "GPS no funcional o sin dispositivo",
  },
  {
    id: "mora_15",
    label: "15+ días",
    descripcion: "15 días o más sin pago",
  },
  {
    id: "mora_4_15",
    label: "4–15 días",
    descripcion: "Entre 4 y 14 días sin pago",
  },
];

export type ItemParaCategoria = {
  dias_mora: number;
  deuda_total: number;
  /** Pagos totales en dinero; 0 = nunca pagó. */
  total_pagado: number;
  /** % cuotas pagadas / generadas. */
  cumplimiento_pct: number;
  ultimo_pago?: string;
  gps: Pick<EstadoGpsPlaca, "funcional">;
};

/**
 * Categoría exclusiva por prioridad:
 * 1 bajo_pago → 2 sin_gps → 3 mora_15 → 4 mora_4_15
 * null = no entra en ninguna bandeja de morosos.
 */
export function clasificarCategoriaMoroso(
  item: ItemParaCategoria,
): CategoriaMoroso | null {
  if (item.deuda_total <= 0) return null;

  const nuncaPago =
    item.total_pagado <= 0 ||
    !item.ultimo_pago ||
    String(item.ultimo_pago).trim() === "";
  const bajoCumplimiento = item.cumplimiento_pct < 20;

  if (nuncaPago || bajoCumplimiento) {
    return "bajo_pago";
  }

  if (!item.gps.funcional) {
    return "sin_gps";
  }

  if (item.dias_mora >= 15) {
    return "mora_15";
  }

  if (item.dias_mora >= 4) {
    return "mora_4_15";
  }

  return null;
}

export function etiquetaCategoriaMoroso(
  id: CategoriaMoroso | string | null | undefined,
): string {
  if (!id) return "";
  return CATEGORIAS_MOROSO.find((c) => c.id === id)?.label ?? id;
}
