import type { PoolClient } from "pg";

import type { FacturaPendiente } from "@/lib/railwebTarifa/fifo";

const MAX_EMIT = 90;
const toInt = (v: unknown): number => Math.round(Number(v));

export type QueryFn = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

export const SQL_FACTURAS_PENDIENTES = `
  SELECT f.id, f.fecha::date::text AS fecha, f.total, f.total_pagado,
         (f.total - f.total_pagado) AS saldo
  FROM terminal_pagos_factura f
  WHERE f.contrato_id = $1
    AND f.estado = 'confirmada'
    AND f.estado_pago = 'pendiente'
    AND (f.total - f.total_pagado) > 0
    AND EXISTS (
      SELECT 1 FROM terminal_pagos_itemfactura i
      WHERE i.factura_id = f.id AND i.tipo_item = 'tarifa'
    )
  ORDER BY f.fecha ASC, f.id ASC
`;

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mapFacturaRows(
  rows: Record<string, unknown>[],
): FacturaPendiente[] {
  return rows.map((r) => ({
    id: Number(r.id),
    fecha: String(r.fecha),
    total: toInt(r.total),
    pagado: toInt(r.total_pagado),
    saldo: toInt(r.saldo),
  }));
}

export async function resolveTarifaDia(
  q: QueryFn,
  contratoId: number,
  tarifaContrato: number,
  fecha: string,
): Promise<number> {
  const r = await q(
    `SELECT CASE EXTRACT(ISODOW FROM $2::date)::int
       WHEN 1 THEN lunes WHEN 2 THEN martes WHEN 3 THEN miercoles
       WHEN 4 THEN jueves WHEN 5 THEN viernes WHEN 6 THEN sabado
       WHEN 7 THEN domingo
     END AS tarifa
     FROM arrendamientos_contratoalquilertarifa
     WHERE contrato_id = $1
       AND fecha_inicio_vigencia <= $2::date
       AND (fecha_fin_vigencia IS NULL OR fecha_fin_vigencia >= $2::date)
     ORDER BY fecha_inicio_vigencia DESC
     LIMIT 1`,
    [contratoId, fecha],
  );
  if (r.rows.length === 0) return tarifaContrato;
  const tarifa = toInt(r.rows[0]!.tarifa);
  return tarifa > 0 ? tarifa : tarifaContrato;
}

/** Solo INSERT de factura + ítem tarifa. Nunca DELETE/anula. */
export async function crearFacturaTarifa(
  client: PoolClient,
  contratoId: number,
  total: number,
  fecha: string,
): Promise<number> {
  const ins = await client.query(
    `INSERT INTO terminal_pagos_factura
       (fecha, estado, estado_pago, total, total_pagado, contrato_id, motivo_anulacion)
     VALUES ($1::date, 'confirmada', 'pendiente', $2, 0, $3, '')
     RETURNING id`,
    [fecha, total, contratoId],
  );
  const facturaId = Number(ins.rows[0]!.id);
  await client.query(
    `INSERT INTO terminal_pagos_itemfactura
       (tipo_item, descripcion, cantidad, valor_unitario, subtotal, factura_id)
     VALUES ('tarifa', 'Pago de tarifa', 1, $1, $1, $2)`,
    [total, facturaId],
  );
  return facturaId;
}

function saldoPendiente(facturas: FacturaPendiente[]): number {
  return facturas.reduce((s, f) => s + f.saldo, 0);
}

/** Emite facturas de tarifa hasta cubrir el monto (dentro de una transacción). */
export async function ensureFacturasParaMonto(
  client: PoolClient,
  contratoId: number,
  tarifaContrato: number,
  fechaPago: string,
  monto: number,
): Promise<FacturaPendiente[]> {
  const q: QueryFn = (text, params) => client.query(text, params);
  let facturas = mapFacturaRows(
    (await client.query(`${SQL_FACTURAS_PENDIENTES} FOR UPDATE`, [contratoId]))
      .rows,
  );
  let saldo = saldoPendiente(facturas);
  let offset = 0;

  while (saldo < monto && offset < MAX_EMIT) {
    const fechaFactura = addDays(fechaPago, offset);
    const tarifa = await resolveTarifaDia(
      q,
      contratoId,
      tarifaContrato,
      fechaFactura,
    );
    if (tarifa <= 0) {
      throw new Error("Tarifa del contrato inválida.");
    }
    await crearFacturaTarifa(client, contratoId, tarifa, fechaFactura);
    offset += 1;
    facturas = mapFacturaRows(
      (await client.query(`${SQL_FACTURAS_PENDIENTES} FOR UPDATE`, [contratoId]))
        .rows,
    );
    saldo = saldoPendiente(facturas);
  }

  if (monto > 0 && saldo <= 0) {
    throw new Error("No se pudieron emitir facturas de tarifa para este pago.");
  }
  return facturas;
}

/** Vista previa: simula emisión sin escribir en la BD. */
export async function facturasConEmisionSimulada(
  q: QueryFn,
  contratoId: number,
  tarifaContrato: number,
  fechaPago: string,
  monto: number,
  existentes: FacturaPendiente[],
): Promise<FacturaPendiente[]> {
  const facturas = [...existentes];
  let saldo = saldoPendiente(facturas);
  let offset = 0;
  let virtualId = -1;

  while (saldo < monto && offset < MAX_EMIT) {
    const fechaFactura = addDays(fechaPago, offset);
    const tarifa = await resolveTarifaDia(
      q,
      contratoId,
      tarifaContrato,
      fechaFactura,
    );
    if (tarifa <= 0) break;
    facturas.push({
      id: virtualId,
      fecha: fechaFactura,
      total: tarifa,
      pagado: 0,
      saldo: tarifa,
    });
    virtualId -= 1;
    saldo += tarifa;
    offset += 1;
  }
  return facturas;
}
