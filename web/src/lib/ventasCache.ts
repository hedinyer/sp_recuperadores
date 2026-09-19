import { unstable_cache, revalidateTag } from "next/cache";

import {
  cargarMetricasVentas,
  type VentasPayload,
} from "@/lib/ventasMetricas";

export const VENTAS_CACHE_TAG = "ventas-metricas";

/**
 * Snapshot de ventas. Key v3 = split nueva/segunda.
 * revalidate 15 min para que “hoy” no quede congelado desde las 6:00.
 * Cron 6:00 COT sigue forzando refresh vía refrescarVentasCache.
 */
export const getVentasCached = unstable_cache(
  async (): Promise<VentasPayload> => cargarMetricasVentas(),
  ["ventas-metricas-v3-nueva-segunda"],
  { tags: [VENTAS_CACHE_TAG], revalidate: 60 * 15 },
);

/** Invalida y carga fresco (cron 6am / refresh manual). */
export async function refrescarVentasCache(): Promise<VentasPayload> {
  revalidateTag(VENTAS_CACHE_TAG);
  // No devolver getVentasCached() aquí: en el mismo request puede seguir stale.
  return cargarMetricasVentas();
}
