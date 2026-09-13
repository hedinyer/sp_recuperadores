import { unstable_cache, revalidateTag } from "next/cache";

import {
  cargarMetricasVentas,
  type VentasPayload,
} from "@/lib/ventasMetricas";

export const VENTAS_CACHE_TAG = "ventas-metricas";

/**
 * Snapshot diario de ventas. Se invalida con revalidateTag desde el cron 6:00 COT.
 * revalidate 24h como red de seguridad si el cron falla.
 */
export const getVentasCached = unstable_cache(
  async (): Promise<VentasPayload> => cargarMetricasVentas(),
  ["ventas-metricas-diario-v1"],
  { tags: [VENTAS_CACHE_TAG], revalidate: 60 * 60 * 24 },
);

/** Invalida y vuelve a cargar (usado por el cron de las 6am Colombia). */
export async function refrescarVentasCache(): Promise<VentasPayload> {
  revalidateTag(VENTAS_CACHE_TAG);
  return getVentasCached();
}
