import { Pool } from "pg";

/** Misma consulta que `db_general.py` (SQL_REPORTE). */
export const SQL_REPORTE_CLIENTES = `
WITH clientes_activos AS (
    SELECT
        c.cedula, c.nombre, c.placa, c.telefono, c.visitador,
        c.fecha_inicio::date AS fecha_inicio,
        c.valor_cuota::numeric AS valor_cuota,
        COALESCE(c.otras_deudas::numeric, 0) AS otras_deudas,
        GREATEST(1, (CURRENT_DATE - c.fecha_inicio::date + 1)) AS cuotas_generadas
    FROM clientes c
    WHERE c.estado = 'activo'
      AND c.fecha_inicio IS NOT NULL
      AND c.fecha_inicio <= CURRENT_DATE
      AND c.valor_cuota > 0
),
pagos_acumulados AS (
    SELECT
        cedula,
        fecha_registro::date AS fecha_pago,
        valor::numeric AS valor_pago,
        SUM(valor::numeric) OVER (PARTITION BY cedula ORDER BY fecha_registro::date, id) AS acumulado_total
    FROM registros
    WHERE tipo NOT ILIKE '%anulacion%'
),
metricas AS (
    SELECT
        ca.cedula, ca.nombre, ca.placa, ca.telefono, ca.visitador,
        ca.fecha_inicio, ca.valor_cuota, ca.otras_deudas, ca.cuotas_generadas,
        COALESCE(pa.acumulado_total, 0) AS total_pagado,
        MAX(pa.fecha_pago) FILTER (WHERE pa.fecha_pago IS NOT NULL) AS ultimo_pago,
        (COALESCE(pa.acumulado_total, 0) / NULLIF(ca.valor_cuota, 0))::integer AS cuotas_completas,
        (COALESCE(pa.acumulado_total, 0) % ca.valor_cuota) AS remanente
    FROM clientes_activos ca
    LEFT JOIN pagos_acumulados pa ON ca.cedula = pa.cedula
    GROUP BY ca.cedula, ca.nombre, ca.placa, ca.telefono, ca.visitador,
             ca.fecha_inicio, ca.valor_cuota, ca.otras_deudas, ca.cuotas_generadas,
             pa.acumulado_total
)
SELECT
    cedula, nombre, placa, telefono, visitador,
    TO_CHAR(fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
    ROUND(valor_cuota, 0) AS valor_cuota,
    cuotas_generadas, cuotas_completas,
    ROUND((cuotas_completas + (remanente / NULLIF(valor_cuota, 0)))::numeric, 1) AS cuotas_pagadas,
    ROUND(GREATEST(0, cuotas_generadas - cuotas_completas - (remanente / NULLIF(valor_cuota, 0)))::numeric, 1) AS cuotas_pendientes,
    ROUND(total_pagado, 0) AS total_pagado,
    ROUND(GREATEST(0, (cuotas_generadas - cuotas_completas - (remanente / NULLIF(valor_cuota, 0))) * valor_cuota + otras_deudas)::numeric, 0) AS deuda_total,
    TO_CHAR(ultimo_pago, 'YYYY-MM-DD') AS ultimo_pago,
    COALESCE((CURRENT_DATE - ultimo_pago)::integer, cuotas_generadas) AS dias_mora,
    ROUND(100.0 * total_pagado / NULLIF(cuotas_generadas * valor_cuota, 0), 1) AS cumplimiento_pct
FROM metricas
ORDER BY cumplimiento_pct ASC NULLS LAST, dias_mora DESC, nombre;
`;

const COLUMNAS = [
  "cedula",
  "nombre",
  "placa",
  "telefono",
  "visitador",
  "fecha_inicio",
  "valor_cuota",
  "cuotas_generadas",
  "cuotas_completas",
  "cuotas_pagadas",
  "cuotas_pendientes",
  "total_pagado",
  "deuda_total",
  "ultimo_pago",
  "dias_mora",
  "cumplimiento_pct",
] as const;

function celdaAString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v !== null && "toString" in v) {
    const s = (v as { toString: () => string }).toString();
    if (s !== "[object Object]") return s;
  }
  return String(v);
}

/** Filas en el mismo shape que `parseCsvPuntoComa` (strings). */
export async function fetchReporteFilasDesdeDb(
  connectionString: string,
): Promise<Record<string, string>[]> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 5_000,
  });
  try {
    const { rows } = await pool.query<Record<string, unknown>>(SQL_REPORTE_CLIENTES);
    return rows.map((row) => {
      const out: Record<string, string> = {};
      for (const k of COLUMNAS) {
        out[k] = celdaAString(row[k]);
      }
      return out;
    });
  } finally {
    await pool.end();
  }
}
