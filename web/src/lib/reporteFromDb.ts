import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import {
  buildFilaReporte,
  fetchMultasPendientesPorContrato,
} from "@/lib/vehiculoPorPlaca";
import type { RegistroExtracto } from "@/lib/extractoCliente";

/** Contratos activos + cliente/vehículo (esquema Django en `db_new.md`). */
export const SQL_CLIENTES_EXTRACTO = `
SELECT
    ct.id AS contrato_id,
    cl.cedula,
    cl.nombre,
    v.placa,
    cl.telefono,
    ven.nombre AS visitador,
    ct.fecha_inicio::date AS fecha_inicio,
    ct.tarifa::numeric AS valor_cuota,
    ct.dias_contrato::text AS fecha_final
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
WHERE ct.estado = 'Activo'
  AND ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND v.placa IS NOT NULL
  AND TRIM(v.placa) <> ''
`;

/**
 * Pagos que abonan cuotas (contratos activos).
 * Solo facturas con ítem `tarifa` (excluye pago_inicial / abono_credito).
 * Resta multas vía `pagomulta` y excluye cargos DALE de $25.000.
 */
export const SQL_REGISTROS_EXTRACTO = `
SELECT
    contrato_id,
    fecha_registro,
    valor,
    tipo,
    referencia
FROM (
  SELECT
      ct.id AS contrato_id,
      pf.fecha_pago::date AS fecha_registro,
      pf.valor::numeric
        - CASE
            WHEN ROW_NUMBER() OVER (
              PARTITION BY f.id ORDER BY pf.fecha_pago, pf.id
            ) = 1
            THEN COALESCE(pm.valor_multa, 0)
            ELSE 0
          END AS valor,
      COALESCE(mp.nombre, '') AS tipo,
      COALESCE(pf.referencia, '') AS referencia
  FROM terminal_pagos_pagofactura pf
  JOIN terminal_pagos_factura f ON f.id = pf.factura_id
  JOIN arrendamientos_contrato ct ON ct.id = f.contrato_id
  LEFT JOIN terminal_pagos_canalpago cp ON cp.id = pf.canal_id
  LEFT JOIN terminal_pagos_mediopago mp ON mp.id = cp.medio_id
  LEFT JOIN (
    SELECT factura_id, SUM(valor::numeric) AS valor_multa
    FROM terminal_pagos_pagomulta
    GROUP BY factura_id
  ) pm ON pm.factura_id = f.id
  WHERE ct.estado = 'Activo'
    AND ct.fecha_inicio IS NOT NULL
    AND lower(f.estado) <> 'anulada'
    AND EXISTS (
      SELECT 1
      FROM terminal_pagos_itemfactura i
      WHERE i.factura_id = f.id
        AND i.tipo_item = 'tarifa'
    )
    AND NOT (
      pf.valor::numeric = 25000
      AND lower(COALESCE(mp.nombre, '')) = 'dale'
    )
) pagos_cuota
WHERE valor > 0
ORDER BY contrato_id, fecha_registro
`;

type ClienteRow = {
  contrato_id: string | number;
  cedula: string;
  nombre: string;
  placa: string;
  telefono: string | null;
  visitador: string | null;
  fecha_inicio: Date;
  valor_cuota: string | number;
  fecha_final: string | null;
};

function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

function registrosPorContrato(
  rows: Array<{
    contrato_id: string | number;
    fecha_registro: Date;
    valor: string | number;
    tipo: string | null;
    referencia: string | null;
  }>,
): Map<string, RegistroExtracto[]> {
  const map = new Map<string, RegistroExtracto[]>();
  for (const row of rows) {
    if (row.fecha_registro == null || row.valor == null) continue;
    const key = String(row.contrato_id);
    const lista = map.get(key) ?? [];
    lista.push({
      fecha: new Date(row.fecha_registro),
      valor: Number(row.valor),
      tipo: row.tipo ?? "",
      referencia: row.referencia ?? "",
    });
    map.set(key, lista);
  }
  return map;
}

async function queryDb(connectionString: string): Promise<{
  clientes: ClienteRow[];
  registros: Array<{
    contrato_id: string | number;
    fecha_registro: Date;
    valor: string | number;
    tipo: string | null;
    referencia: string | null;
  }>;
  multasPorContrato: Map<string, number>;
}> {
  const clientes = await queryPg<ClienteRow>(
    connectionString,
    SQL_CLIENTES_EXTRACTO,
  );

  if (!clientes.length) {
    return { clientes: [], registros: [], multasPorContrato: new Map() };
  }

  const [registros, multasPorContrato] = await Promise.all([
    queryPg<{
      contrato_id: string | number;
      fecha_registro: Date;
      valor: string | number;
      tipo: string | null;
      referencia: string | null;
    }>(connectionString, SQL_REGISTROS_EXTRACTO),
    fetchMultasPendientesPorContrato(connectionString),
  ]);

  return { clientes, registros, multasPorContrato };
}

/** Reporte completo (~900 filas). Usar solo cuando haga falta la lista entera. */
export async function fetchReporteFilasDesdeDb(
  connectionStrings?: string[],
): Promise<Record<string, string>[]> {
  const urls = connectionStrings ?? getDatabaseUrls();
  const results = await Promise.allSettled(urls.map((cs) => queryDb(cs)));

  const todosClientes: ClienteRow[] = [];
  const todosRegistros: Array<{
    contrato_id: string | number;
    fecha_registro: Date;
    valor: string | number;
    tipo: string | null;
    referencia: string | null;
  }> = [];
  const multasPorContrato = new Map<string, number>();

  for (const r of results) {
    if (r.status === "fulfilled") {
      todosClientes.push(...r.value.clientes);
      todosRegistros.push(...r.value.registros);
      for (const [id, monto] of r.value.multasPorContrato) {
        multasPorContrato.set(id, (multasPorContrato.get(id) ?? 0) + monto);
      }
    } else {
      console.warn(
        "[reporteFromDb] Error en una base:",
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  }

  if (!todosClientes.length) return [];

  const seenPlacas = new Set<string>();
  const clientesUnicos: ClienteRow[] = [];
  for (const c of todosClientes) {
    const placaKey = normalizarPlaca(c.placa ?? "");
    if (!placaKey || seenPlacas.has(placaKey)) continue;
    seenPlacas.add(placaKey);
    clientesUnicos.push(c);
  }

  const registrosMap = registrosPorContrato(todosRegistros);
  const filas: Record<string, string>[] = [];

  for (const c of clientesUnicos) {
    const valorCuota = Number(c.valor_cuota);
    if (!c.fecha_inicio || valorCuota <= 0) continue;

    const regs = registrosMap.get(String(c.contrato_id)) ?? [];
    const deudaMultas = multasPorContrato.get(String(c.contrato_id)) ?? 0;
    filas.push(buildFilaReporte(c, regs, deudaMultas));
  }

  filas.sort((a, b) => {
    const ca = parseFloat(a.cumplimiento_pct) || 0;
    const cb = parseFloat(b.cumplimiento_pct) || 0;
    if (ca !== cb) return ca - cb;
    const da = parseInt(a.dias_mora, 10) || 0;
    const db = parseInt(b.dias_mora, 10) || 0;
    if (da !== db) return db - da;
    return (a.nombre ?? "").localeCompare(b.nombre ?? "", "es");
  });

  return filas;
}
