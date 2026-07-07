import {
  calcularMetricasExtracto,
  parseDiasCredito,
  type RegistroExtracto,
} from "@/lib/extractoCliente";
import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

type ClienteDbRow = {
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

type RegistroDbRow = {
  fecha_registro: Date;
  valor: string | number;
  tipo: string | null;
  referencia: string | null;
};

const SQL_CLIENTE_POR_PLACA = `
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
  AND upper(replace(v.placa, ' ', '')) = $1
LIMIT 1
`;

const SQL_CLIENTE_POR_PLACA_PREFIJO = `
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
  AND upper(replace(v.placa, ' ', '')) LIKE $1 || '%'
ORDER BY upper(replace(v.placa, ' ', ''))
LIMIT 1
`;

const SQL_REGISTROS_CONTRATO = `
SELECT
    pf.fecha_pago::date AS fecha_registro,
    pf.valor::numeric AS valor,
    COALESCE(mp.nombre, '') AS tipo,
    COALESCE(pf.referencia, '') AS referencia
FROM terminal_pagos_pagofactura pf
JOIN terminal_pagos_factura f ON f.id = pf.factura_id
JOIN arrendamientos_contrato ct ON ct.id = f.contrato_id
LEFT JOIN terminal_pagos_canalpago cp ON cp.id = pf.canal_id
LEFT JOIN terminal_pagos_mediopago mp ON mp.id = cp.medio_id
WHERE ct.id = $1
  AND lower(f.estado) <> 'anulada'
ORDER BY pf.fecha_pago
`;

const SQL_EXISTE_PLACA = `
SELECT 1
FROM arrendamientos_contrato ct
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE ct.estado = 'Activo'
  AND ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND upper(replace(v.placa, ' ', '')) = $1
LIMIT 1
`;

/** Multas con saldo pendiente (mismo criterio que el ERP). */
export const SQL_MULTAS_PENDIENTES_CONTRATO = `
SELECT COALESCE(SUM(m.saldo::numeric), 0) AS deuda_multas
FROM terminal_pagos_multa m
WHERE m.contrato_id = $1
  AND m.saldo::numeric > 0
`;

export const SQL_MULTAS_PENDIENTES_LOTE = `
SELECT m.contrato_id, COALESCE(SUM(m.saldo::numeric), 0) AS deuda_multas
FROM terminal_pagos_multa m
WHERE m.saldo::numeric > 0
GROUP BY m.contrato_id
`;

export async function fetchDeudaMultasPendientes(
  connectionString: string,
  contratoId: string | number,
): Promise<number> {
  const rows = await queryPg<{ deuda_multas: string | number }>(
    connectionString,
    SQL_MULTAS_PENDIENTES_CONTRATO,
    [contratoId],
  );
  return Math.round(Number(rows[0]?.deuda_multas ?? 0));
}

export async function fetchMultasPendientesPorContrato(
  connectionString: string,
): Promise<Map<string, number>> {
  const rows = await queryPg<{
    contrato_id: string | number;
    deuda_multas: string | number;
  }>(connectionString, SQL_MULTAS_PENDIENTES_LOTE);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row.contrato_id), Math.round(Number(row.deuda_multas)));
  }
  return map;
}

function fechaAString(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return v == null ? "" : String(v);
}

export function buildFilaReporte(
  c: ClienteDbRow,
  registros: RegistroExtracto[],
  deudaMultas = 0,
): Record<string, string> {
  const valorCuota = Number(c.valor_cuota);
  const m = calcularMetricasExtracto(
    new Date(c.fecha_inicio),
    valorCuota,
    registros,
    parseDiasCredito(c.fecha_final),
  );

  const deudaCuotas = Math.round(m.deuda_total);
  const multas = Math.round(deudaMultas);

  return {
    cedula: c.cedula,
    nombre: c.nombre ?? "",
    placa: c.placa ?? "",
    telefono: c.telefono ?? "",
    visitador: c.visitador ?? "",
    fecha_inicio: fechaAString(c.fecha_inicio),
    valor_cuota: String(Math.round(valorCuota)),
    cuotas_generadas: String(m.cuotas_generadas),
    cuotas_completas: String(m.cuotas_completas),
    cuotas_pagadas: m.cuotas_pagadas.toFixed(1),
    cuotas_pendientes: m.cuotas_pendientes.toFixed(1),
    total_pagado: String(Math.round(m.total_pagado)),
    deuda_cuotas: String(deudaCuotas),
    deuda_multas: String(multas),
    deuda_total: String(deudaCuotas + multas),
    ultimo_pago: m.ultimo_pago,
    dias_mora: String(m.dias_mora),
    cumplimiento_pct: String(m.cumplimiento_pct),
  };
}

function registrosDesdeRows(rows: RegistroDbRow[]): RegistroExtracto[] {
  return rows
    .filter((r) => r.fecha_registro != null && r.valor != null)
    .map((r) => ({
      fecha: new Date(r.fecha_registro),
      valor: Number(r.valor),
      tipo: r.tipo ?? "",
      referencia: r.referencia ?? "",
    }));
}

const CACHE_TTL_MS =
  process.env.NODE_ENV === "production" ? 300_000 : 120_000;
const cachePlaca = new Map<
  string,
  { fila: Record<string, string> | null; expira: number }
>();

async function fetchDesdeUrl(
  connectionString: string,
  placaNorm: string,
): Promise<Record<string, string> | null> {
  const sql =
    placaNorm.length === 5
      ? SQL_CLIENTE_POR_PLACA_PREFIJO
      : SQL_CLIENTE_POR_PLACA;
  const clientes = await queryPg<ClienteDbRow>(connectionString, sql, [
    placaNorm,
  ]);
  const cliente = clientes[0];
  if (!cliente) return null;

  const [regRows, deudaMultas] = await Promise.all([
    queryPg<RegistroDbRow>(connectionString, SQL_REGISTROS_CONTRATO, [
      cliente.contrato_id,
    ]),
    fetchDeudaMultasPendientes(connectionString, cliente.contrato_id),
  ]);

  return buildFilaReporte(cliente, registrosDesdeRows(regRows), deudaMultas);
}

/** Limpia caché de consulta (p. ej. tras registrar multa en el ERP). */
export function invalidarCachePlaca(placa: string): void {
  const placaNorm = normalizarPlaca(placa);
  if (placaNorm) cachePlaca.delete(placaNorm);
}

/**
 * Una fila del reporte para una placa (sin cargar los ~900 contratos).
 */
export async function fetchVehiculoPorPlaca(
  placa: string,
): Promise<Record<string, string> | null> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm || placaNorm.length < 5) return null;

  const ahora = Date.now();
  const cached = cachePlaca.get(placaNorm);
  if (cached && cached.expira > ahora) {
    return cached.fila;
  }

  const urls = getDatabaseUrls();
  let fila: Record<string, string> | null = null;

  for (const url of urls) {
    try {
      const found = await fetchDesdeUrl(url, placaNorm);
      if (found) {
        fila = found;
        break;
      }
    } catch (e) {
      console.warn(
        "[vehiculoPorPlaca] Error en una base:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  cachePlaca.set(placaNorm, { fila, expira: ahora + CACHE_TTL_MS });
  return fila;
}

/** Comprueba si la placa tiene contrato activo (query mínima). */
export async function existePlacaActiva(placa: string): Promise<boolean> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm) return false;

  for (const url of getDatabaseUrls()) {
    try {
      const rows = await queryPg<{ "?column?": number }>(
        url,
        SQL_EXISTE_PLACA,
        [placaNorm],
      );
      if (rows.length > 0) return true;
    } catch {
      // siguiente URL
    }
  }
  return false;
}
