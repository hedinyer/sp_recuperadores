import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import {
  buildFilaReporte,
  fetchMultasPendientesPorContrato,
} from "@/lib/vehiculoPorPlaca";
import type { RegistroExtracto } from "@/lib/extractoCliente";
import {
  SQL_EXPR_VALOR_CUOTA,
  SQL_FILTRO_PAGO_TARIFA,
  SQL_JOINS_PAGO_TARIFA,
} from "@/lib/sqlPagosCuota";

/** Contratos activos + cliente/vehículo (esquema Django en `db_new.md`). */
export const SQL_CLIENTES_EXTRACTO = `
SELECT
    ct.id AS contrato_id,
    cl.cedula,
    cl.nombre,
    v.placa,
    cl.telefono,
    cl.referencia_1,
    cl.telefono_ref_1,
    cl.referencia_2,
    cl.telefono_ref_2,
    ven.nombre AS visitador,
    ct.fecha_inicio::date AS fecha_inicio,
    ct.tarifa::numeric AS valor_cuota,
    ct.dias_contrato::text AS fecha_final,
    ct.estado,
    v.estado AS estado_vehiculo,
    ct.fecha_cancelacion
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
 * Prorratea por ítem `tarifa` (no cuenta pago_inicial / abono_credito / multa ítem).
 * Resta `pagomulta` solo si no hay ítem multa; excluye DALE $25.000.
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
      (${SQL_EXPR_VALOR_CUOTA.trim()}) AS valor,
      COALESCE(mp.nombre, '') AS tipo,
      COALESCE(pf.referencia, '') AS referencia
  FROM terminal_pagos_pagofactura pf
  JOIN terminal_pagos_factura f ON f.id = pf.factura_id
  JOIN arrendamientos_contrato ct ON ct.id = f.contrato_id
  ${SQL_JOINS_PAGO_TARIFA}
  WHERE ct.estado = 'Activo'
    AND ct.fecha_inicio IS NOT NULL
    AND ${SQL_FILTRO_PAGO_TARIFA.trim()}
) pagos_cuota
WHERE valor > 0
ORDER BY contrato_id, fecha_registro
`;
/** Días que no generan cuota (ERP `arrendamientos_freezeday`). */
export const SQL_FREEZE_DAYS = `
SELECT contrato_id, fecha::text AS fecha
FROM arrendamientos_freezeday
`;

export function freezeDaysByContrato(
  rows: Array<{ contrato_id: string | number; fecha: string | null }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const fecha = String(row.fecha ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const key = String(row.contrato_id);
    const list = map.get(key) ?? [];
    list.push(fecha);
    map.set(key, list);
  }
  return map;
}

export async function fetchFreezeDaysPorContrato(
  connectionString: string,
): Promise<Map<string, string[]>> {
  try {
    const rows = await queryPg<{
      contrato_id: string | number;
      fecha: string | null;
    }>(connectionString, SQL_FREEZE_DAYS);
    return freezeDaysByContrato(rows);
  } catch (e) {
    console.warn(
      "[reporteFromDb] arrendamientos_freezeday:",
      e instanceof Error ? e.message : e,
    );
    return new Map();
  }
}

type ClienteRow = {
  contrato_id: string | number;
  cedula: string;
  nombre: string;
  placa: string;
  telefono: string | null;
  referencia_1?: string | null;
  telefono_ref_1?: string | null;
  referencia_2?: string | null;
  telefono_ref_2?: string | null;
  visitador: string | null;
  fecha_inicio: Date;
  valor_cuota: string | number;
  fecha_final: string | null;
  estado?: string | null;
  estado_vehiculo?: string | null;
  fecha_cancelacion?: Date | string | null;
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
  freezeByContrato: Map<string, string[]>;
}> {
  const clientes = await queryPg<ClienteRow>(
    connectionString,
    SQL_CLIENTES_EXTRACTO,
  );

  if (!clientes.length) {
    return {
      clientes: [],
      registros: [],
      multasPorContrato: new Map(),
      freezeByContrato: new Map(),
    };
  }

  const [registros, multasPorContrato, freezeByContrato] = await Promise.all([
    queryPg<{
      contrato_id: string | number;
      fecha_registro: Date;
      valor: string | number;
      tipo: string | null;
      referencia: string | null;
    }>(connectionString, SQL_REGISTROS_EXTRACTO),
    fetchMultasPendientesPorContrato(connectionString),
    fetchFreezeDaysPorContrato(connectionString),
  ]);

  return { clientes, registros, multasPorContrato, freezeByContrato };
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
  const freezeByContrato = new Map<string, string[]>();

  for (const r of results) {
    if (r.status === "fulfilled") {
      todosClientes.push(...r.value.clientes);
      todosRegistros.push(...r.value.registros);
      for (const [id, monto] of r.value.multasPorContrato) {
        multasPorContrato.set(id, (multasPorContrato.get(id) ?? 0) + monto);
      }
      for (const [id, fechas] of r.value.freezeByContrato) {
        const prev = freezeByContrato.get(id) ?? [];
        freezeByContrato.set(id, [...prev, ...fechas]);
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
    const freeze = freezeByContrato.get(String(c.contrato_id)) ?? [];
    filas.push(buildFilaReporte(c, regs, deudaMultas, freeze));
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

export type EstadoPlacaErp = {
  placa: string;
  estado_contrato: string;
  estado_vehiculo: string;
};

export type PagoErpPlaca = {
  placa: string;
  fecha: string;
  monto: number;
};

/** Último contrato por placa (prioriza Activo). */
const SQL_ESTADOS_POR_PLACAS = `
SELECT DISTINCT ON (upper(replace(v.placa, ' ', '')))
  upper(replace(v.placa, ' ', '')) AS placa,
  COALESCE(ct.estado, '') AS estado_contrato,
  COALESCE(v.estado, '') AS estado_vehiculo
FROM arrendamientos_contrato ct
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE upper(replace(v.placa, ' ', '')) = ANY($1::text[])
ORDER BY
  upper(replace(v.placa, ' ', '')),
  (ct.estado = 'Activo') DESC,
  ct.fecha_inicio DESC NULLS LAST
`;

/** Pagos de cuota ERP por placa en rango de fechas (incl. contratos no activos). */
const SQL_PAGOS_POR_PLACAS_RANGO = `
SELECT
  placa,
  fecha_registro::text AS fecha,
  SUM(valor)::numeric AS monto
FROM (
  SELECT
      upper(replace(v.placa, ' ', '')) AS placa,
      pf.fecha_pago::date AS fecha_registro,
      (${SQL_EXPR_VALOR_CUOTA.trim()}) AS valor
  FROM terminal_pagos_pagofactura pf
  JOIN terminal_pagos_factura f ON f.id = pf.factura_id
  JOIN arrendamientos_contrato ct ON ct.id = f.contrato_id
  JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
  ${SQL_JOINS_PAGO_TARIFA}
  WHERE upper(replace(v.placa, ' ', '')) = ANY($1::text[])
    AND pf.fecha_pago::date >= $2::date
    AND pf.fecha_pago::date <= $3::date
    AND ${SQL_FILTRO_PAGO_TARIFA.trim()}
) pagos
WHERE valor > 0
GROUP BY placa, fecha_registro
`;
function chunkPlacas(placas: string[], size = 200): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < placas.length; i += size) {
    out.push(placas.slice(i, i + size));
  }
  return out;
}

/** Estados contrato/vehículo ERP para un lote de placas. */
export async function fetchEstadosPorPlacas(
  placas: string[],
): Promise<Map<string, EstadoPlacaErp>> {
  const map = new Map<string, EstadoPlacaErp>();
  const uniq = [
    ...new Set(
      placas
        .map((p) => p.toUpperCase().replace(/\s/g, ""))
        .filter(Boolean),
    ),
  ];
  if (!uniq.length) return map;

  const urls = getDatabaseUrls();
  for (const chunk of chunkPlacas(uniq)) {
    for (const url of urls) {
      try {
        const rows = await queryPg<{
          placa: string;
          estado_contrato: string;
          estado_vehiculo: string;
        }>(url, SQL_ESTADOS_POR_PLACAS, [chunk]);
        for (const r of rows) {
          const placa = String(r.placa ?? "")
            .toUpperCase()
            .replace(/\s/g, "");
          if (!placa || map.has(placa)) continue;
          map.set(placa, {
            placa,
            estado_contrato: String(r.estado_contrato ?? "").trim(),
            estado_vehiculo: String(r.estado_vehiculo ?? "").trim(),
          });
        }
      } catch (e) {
        console.warn(
          "[reporteFromDb] estados placas:",
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  return map;
}

/**
 * Pagos ERP (cuotas) por placa entre dos fechas YYYY-MM-DD inclusive.
 * Atribución por placa, no por quién anotó la gestión.
 */
export async function fetchPagosErpPorPlacas(
  placas: string[],
  desdeYmd: string,
  hastaYmd: string,
): Promise<PagoErpPlaca[]> {
  const uniq = [
    ...new Set(
      placas
        .map((p) => p.toUpperCase().replace(/\s/g, ""))
        .filter(Boolean),
    ),
  ];
  if (
    !uniq.length ||
    !/^\d{4}-\d{2}-\d{2}$/.test(desdeYmd) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(hastaYmd)
  ) {
    return [];
  }

  const byKey = new Map<string, PagoErpPlaca>();
  const urls = getDatabaseUrls();
  for (const chunk of chunkPlacas(uniq)) {
    for (const url of urls) {
      try {
        const rows = await queryPg<{
          placa: string;
          fecha: string;
          monto: string | number;
        }>(url, SQL_PAGOS_POR_PLACAS_RANGO, [chunk, desdeYmd, hastaYmd]);
        for (const r of rows) {
          const placa = String(r.placa ?? "")
            .toUpperCase()
            .replace(/\s/g, "");
          const fecha = String(r.fecha ?? "").slice(0, 10);
          const monto = Math.round(Number(r.monto) || 0);
          if (!placa || !fecha || monto <= 0) continue;
          const key = `${placa}|${fecha}`;
          // ponytail: primera base gana; evita sumar el mismo pago en 2 URLs
          if (byKey.has(key)) continue;
          byKey.set(key, { placa, fecha, monto });
        }
      } catch (e) {
        console.warn(
          "[reporteFromDb] pagos ERP placas:",
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  return [...byKey.values()];
}
