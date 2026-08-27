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
  /** Estado del contrato en el ERP (`Activo`, `Inactivo`, etc.). */
  estado?: string | null;
  /** Estado del vehículo (`Activo`, `Vitrina`, `Inactivo`, etc.). */
  estado_vehiculo?: string | null;
};

/** Solo contratos y motos activos generan deuda cobrable. */
export function esDeudaCobrable(
  estadoContrato: string | null | undefined,
  estadoVehiculo?: string | null,
): boolean {
  const ct = String(estadoContrato ?? "Activo").trim().toLowerCase();
  if (ct !== "activo") return false;
  // Sin dato de vehículo (p. ej. reportes masivos) se asume activo.
  if (estadoVehiculo == null || String(estadoVehiculo).trim() === "") {
    return true;
  }
  return String(estadoVehiculo).trim().toLowerCase() === "activo";
}

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
    ct.dias_contrato::text AS fecha_final,
    ct.estado,
    v.estado AS estado_vehiculo
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
WHERE ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND upper(replace(v.placa, ' ', '')) = $1
ORDER BY (ct.estado = 'Activo') DESC, ct.fecha_inicio DESC
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
    ct.dias_contrato::text AS fecha_final,
    ct.estado,
    v.estado AS estado_vehiculo
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
WHERE ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND upper(replace(v.placa, ' ', '')) LIKE $1 || '%'
ORDER BY
  upper(replace(v.placa, ' ', '')),
  (ct.estado = 'Activo') DESC,
  ct.fecha_inicio DESC
LIMIT 1
`;

/**
 * Pagos que abonan cuotas del arriendo.
 * - Solo facturas con ítem `tarifa` (excluye pago_inicial / abono_credito).
 * - Resta lo aplicado a multas (`terminal_pagos_pagomulta`).
 * - Excluye cargos DALE de $25.000 (publicación/GPS), que no son cuota.
 */
const SQL_REGISTROS_CONTRATO = `
SELECT
    fecha_registro,
    valor,
    tipo,
    referencia
FROM (
  SELECT
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
  WHERE ct.id = $1
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
ORDER BY fecha_registro
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
  fechasCongeladas: Iterable<string> = [],
): Record<string, string> {
  const valorCuota = Number(c.valor_cuota);
  const estadoContrato = String(c.estado ?? "Activo").trim() || "Activo";
  const estadoVehiculo =
    c.estado_vehiculo == null || String(c.estado_vehiculo).trim() === ""
      ? ""
      : String(c.estado_vehiculo).trim();
  const cobrable = esDeudaCobrable(estadoContrato, c.estado_vehiculo);

  const m = calcularMetricasExtracto(
    new Date(c.fecha_inicio),
    valorCuota,
    registros,
    parseDiasCredito(c.fecha_final),
    undefined,
    fechasCongeladas,
  );

  const deudaCuotas = cobrable ? Math.round(m.deuda_total) : 0;
  const multas = cobrable ? Math.round(deudaMultas) : 0;

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
    cuotas_pendientes: cobrable ? m.cuotas_pendientes.toFixed(1) : "0",
    total_pagado: String(Math.round(m.total_pagado)),
    deuda_cuotas: String(deudaCuotas),
    deuda_multas: String(multas),
    deuda_total: String(deudaCuotas + multas),
    ultimo_pago: m.ultimo_pago,
    dias_mora: cobrable ? String(m.dias_mora) : "0",
    cumplimiento_pct: String(m.cumplimiento_pct),
    estado_contrato: estadoContrato,
    estado_vehiculo: estadoVehiculo,
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

  const [regRows, deudaMultas, freezeRows] = await Promise.all([
    queryPg<RegistroDbRow>(connectionString, SQL_REGISTROS_CONTRATO, [
      cliente.contrato_id,
    ]),
    fetchDeudaMultasPendientes(connectionString, cliente.contrato_id),
    queryPg<{ fecha: string | null }>(
      connectionString,
      "SELECT fecha::text AS fecha FROM arrendamientos_freezeday WHERE contrato_id = $1",
      [cliente.contrato_id],
    ).catch(() => [] as Array<{ fecha: string | null }>),
  ]);

  const freeze = freezeRows
    .map((r) => String(r.fecha ?? "").slice(0, 10))
    .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));

  return buildFilaReporte(
    cliente,
    registrosDesdeRows(regRows),
    deudaMultas,
    freeze,
  );
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
