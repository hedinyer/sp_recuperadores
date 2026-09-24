import {
  calcularMetricasExtracto,
  parseDiasCredito,
  type RegistroExtracto,
} from "@/lib/extractoCliente";
import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import {
  SQL_EXPR_VALOR_CUOTA,
  SQL_FILTRO_PAGO_TARIFA,
  SQL_JOINS_PAGO_TARIFA,
} from "@/lib/sqlPagosCuota";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";
import {
  esCompraSpEnCalle,
  esCompraSpVigente,
  fetchVehiculoPorPlacaSp,
} from "@/lib/vehiculoPorPlacaBga";

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
  /** Estado del contrato en el ERP (`Activo`, `Inactivo`, `Retenido`, etc.). */
  estado?: string | null;
  /** Estado del vehículo (`Activo`, `Vitrina`, `Inactivo`, etc.). */
  estado_vehiculo?: string | null;
  /** Corte de deuda cuando el contrato deja de estar activo. */
  fecha_cancelacion?: Date | string | null;
};

function normEstado(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

/** Solo contratos y motos activos se cobran en cartera / lotes. */
export function esDeudaCobrable(
  estadoContrato: string | null | undefined,
  estadoVehiculo?: string | null,
): boolean {
  const ct = normEstado(estadoContrato).toLowerCase() || "activo";
  if (ct !== "activo") return false;
  // Sin dato de vehículo (p. ej. reportes masivos) se asume activo.
  if (estadoVehiculo == null || normEstado(estadoVehiculo) === "") {
    return true;
  }
  return normEstado(estadoVehiculo).toLowerCase() === "activo";
}

/**
 * Etiqueta grande para UI: RETENIDO / INACTIVO / VITRINA…
 * Prioriza estado del contrato; si el contrato sigue activo, usa el del vehículo.
 */
export function etiquetaEstadoDestacado(
  estadoContrato: string | null | undefined,
  estadoVehiculo?: string | null,
): string | null {
  const ct = normEstado(estadoContrato);
  const veh = normEstado(estadoVehiculo);
  const ctLow = ct.toLowerCase();
  const vehLow = veh.toLowerCase();
  if (ct && ctLow !== "activo") return ct.toUpperCase();
  if (veh && vehLow !== "activo") return veh.toUpperCase();
  return null;
}

/** Texto corto cuando el contrato/moto no está activo. */
export function motivoDeudaNoCobrable(
  estadoContrato: string | null | undefined,
  estadoVehiculo?: string | null,
): string | null {
  const etiqueta = etiquetaEstadoDestacado(estadoContrato, estadoVehiculo);
  if (!etiqueta) return null;
  const ct = normEstado(estadoContrato).toLowerCase();
  if (ct && ct !== "activo") {
    return `Contrato ${etiqueta}: deuda al corte (no sigue generando mora)`;
  }
  return `Vehículo ${etiqueta}: deuda al corte (no sigue generando mora)`;
}

/** Fecha de corte para congelar cuotas (cancelación / retención). */
export function fechaCorteDeuda(
  estadoContrato: string | null | undefined,
  estadoVehiculo: string | null | undefined,
  fechaCancelacion: Date | string | null | undefined,
): Date | undefined {
  if (esDeudaCobrable(estadoContrato, estadoVehiculo)) return undefined;
  if (fechaCancelacion == null || fechaCancelacion === "") return undefined;
  const d = new Date(fechaCancelacion);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

/** True si la fila proviene de Supabase SP (BGA o Bogotá). */
export function esFuenteSp(
  fila: Record<string, string> | null | undefined,
): boolean {
  const f = String(fila?.fuente ?? "").toLowerCase();
  return f === "bga" || f === "bogota";
}

/** @deprecated usar esFuenteSp */
export function esFuenteBga(
  fila: Record<string, string> | null | undefined,
): boolean {
  return esFuenteSp(fila);
}

export function mensajeBloqueoRailweb(
  fila: Record<string, string> | null | undefined,
): string {
  const f = String(fila?.fuente ?? "").toLowerCase();
  const sede = f === "bogota" ? "Bogotá" : f === "bga" ? "BGA" : "el sistema nuevo";
  return `Esta placa está activa en ${sede}. No registres la tarifa en Railweb.`;
}

function fechaSpMs(fila: Record<string, string>): number {
  const t = new Date(fila.fecha_sp || fila.fecha_inicio || "").getTime();
  return Number.isNaN(t) ? 0 : t;
}

function esFilaSpVigente(fila: Record<string, string>): boolean {
  return esCompraSpVigente(fila.estado_sp || fila.estado_contrato);
}

function esFilaSpEnCalle(fila: Record<string, string>): boolean {
  if (fila.estado_sp || fila.estado_fisico_sp) {
    return esCompraSpEnCalle(fila.estado_sp, fila.estado_fisico_sp);
  }
  return esDeudaCobrable(fila.estado_contrato, fila.estado_vehiculo);
}

/** Entre BGA y Bogotá: vigente en calle, luego vigente, luego la más reciente. */
export function elegirMejorSp(
  bga: Record<string, string> | null,
  bogota: Record<string, string> | null,
): Record<string, string> | null {
  const rows = [bga, bogota].filter(
    (r): r is Record<string, string> => r != null,
  );
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0];

  const vigentes = rows.filter(esFilaSpVigente);
  const cand = vigentes.length ? vigentes : rows;
  const enCalle = cand.filter(esFilaSpEnCalle);
  const pool = enCalle.length ? enCalle : cand;
  return [...pool].sort((a, b) => fechaSpMs(b) - fechaSpMs(a))[0];
}

/**
 * Sistema nuevo vigente gana siempre. Railweb solo si no hay SP vigente.
 * Si solo hay SP cancelada, se muestra esa.
 */
export function elegirFilaPlaca(
  railweb: Record<string, string> | null,
  bga: Record<string, string> | null,
  bogota: Record<string, string> | null,
): Record<string, string> | null {
  const sp = elegirMejorSp(bga, bogota);
  if (sp && esFilaSpVigente(sp)) return sp;
  if (railweb) return { ...railweb, fuente: railweb.fuente || "railweb" };
  return sp;
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
    v.estado AS estado_vehiculo,
    ct.fecha_cancelacion
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
WHERE ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND upper(replace(v.placa, ' ', '')) = $1
ORDER BY
  (ct.estado = 'Activo') DESC,
  (ct.estado = 'Retenido') DESC,
  ct.fecha_inicio DESC
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
    v.estado AS estado_vehiculo,
    ct.fecha_cancelacion
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
  (ct.estado = 'Retenido') DESC,
  ct.fecha_inicio DESC
LIMIT 1
`;

/**
 * Pagos que abonan cuotas del arriendo.
 * Prorratea por ítem `tarifa` (excluye pago_inicial / abono / multa ítem).
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
      (${SQL_EXPR_VALOR_CUOTA.trim()}) AS valor,
      COALESCE(mp.nombre, '') AS tipo,
      COALESCE(pf.referencia, '') AS referencia
  FROM terminal_pagos_pagofactura pf
  JOIN terminal_pagos_factura f ON f.id = pf.factura_id
  JOIN arrendamientos_contrato ct ON ct.id = f.contrato_id
  ${SQL_JOINS_PAGO_TARIFA}
  WHERE ct.id = $1
    AND ${SQL_FILTRO_PAGO_TARIFA.trim()}
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
  const estadoContrato = normEstado(c.estado) || "Activo";
  const estadoVehiculo = normEstado(c.estado_vehiculo);
  const cobrable = esDeudaCobrable(estadoContrato, c.estado_vehiculo);
  const etiqueta = etiquetaEstadoDestacado(estadoContrato, c.estado_vehiculo);
  const fechaCorte = fechaCorteDeuda(
    estadoContrato,
    c.estado_vehiculo,
    c.fecha_cancelacion,
  );

  const m = calcularMetricasExtracto(
    new Date(c.fecha_inicio),
    valorCuota,
    registros,
    parseDiasCredito(c.fecha_final),
    fechaCorte,
    fechasCongeladas,
  );

  // Siempre mostrar deuda real; si no es cobrable, queda al corte (cancelación).
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
    estado_contrato: estadoContrato,
    estado_vehiculo: estadoVehiculo,
    etiqueta_estado: etiqueta ?? "",
    deuda_al_corte: cobrable ? "" : "1",
    fecha_corte: fechaCorte ? fechaAString(fechaCorte) : "",
    motivo_estado: motivoDeudaNoCobrable(estadoContrato, c.estado_vehiculo) ?? "",
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
 * BGA/Bogotá vigente gana a Railweb: ahí vive la placa ahora.
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

  const railwebP = fetchVehiculoPorPlacaRailweb(placaNorm);
  const [bga, bogota] = await Promise.all([
    fetchVehiculoPorPlacaSp("bga", placaNorm),
    fetchVehiculoPorPlacaSp("bogota", placaNorm),
  ]);

  // ponytail: si SP vigente ya ganó, no esperar el ERP
  const sp = elegirFilaPlaca(null, bga, bogota);
  if (sp && esFuenteSp(sp) && esFilaSpVigente(sp)) {
    cachePlaca.set(placaNorm, { fila: sp, expira: ahora + CACHE_TTL_MS });
    void railwebP.catch(() => null);
    return sp;
  }

  const railweb = await railwebP;
  const fila = elegirFilaPlaca(railweb, bga, bogota);
  cachePlaca.set(placaNorm, { fila, expira: ahora + CACHE_TTL_MS });
  return fila;
}

async function fetchVehiculoPorPlacaRailweb(
  placaNorm: string,
): Promise<Record<string, string> | null> {
  const urls = getDatabaseUrls();
  for (const url of urls) {
    try {
      const found = await fetchDesdeUrl(url, placaNorm);
      if (found) return found;
    } catch (e) {
      console.warn(
        "[vehiculoPorPlaca] Error en una base:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return null;
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
