/**
 * Registro de pagos de tarifa en Railweb (ERP Postgres).
 * Solo INSERT + UPDATE total_pagado/estado_pago. Nunca DELETE ni anulación.
 */

import type { PoolClient, QueryResultRow } from "pg";

import { getDatabaseUrls } from "@/lib/dbUrls";
import { getPgPool } from "@/lib/pgPool";
import { planFifo, type FacturaPendiente } from "@/lib/railwebTarifa/fifo";
import {
  SQL_FACTURAS_PENDIENTES,
  ensureFacturasParaMonto,
  facturasConEmisionSimulada,
  mapFacturaRows,
} from "@/lib/railwebTarifa/facturaTarifa";
import type {
  ContratoOpt,
  Destinatario,
  FacturaView,
  PagoAplicado,
  PreviewResult,
  RegistrarResult,
} from "@/lib/railwebTarifa/types";

const MEDIO_NEQUI = "Transfer Nequi";
const ESTADO_PREPAGO = "disponible";

const toInt = (v: unknown): number => Math.round(Number(v));

const SQL_DESTINATARIOS = `
  SELECT cfg.id AS configuracion_id, ct.nombre AS cuenta
  FROM terminal_pagos_configuracionpago cfg
  JOIN terminal_pagos_mediopago m ON m.id = cfg.medio_id
  JOIN terminal_pagos_cuenta ct ON ct.id = cfg.cuenta_destino_id
  WHERE m.nombre = $1 AND cfg.activo = true
  ORDER BY cfg.id;
`;

const SQL_CANAL_NEQUI = `
  SELECT cp.id
  FROM terminal_pagos_canalpago cp
  JOIN terminal_pagos_mediopago m ON m.id = cp.medio_id
  WHERE m.nombre = $1 AND cp.activo = true
  ORDER BY cp.id
  LIMIT 1;
`;

const SQL_CONTRATOS = `
  SELECT c.id AS contrato_id, cl.id AS cliente_id, cl.nombre, cl.cedula,
         c.tarifa, c.frecuencia_pago, c.estado
  FROM arrendamientos_contrato c
  JOIN vehiculos_vehiculo v ON v.id = c.vehiculo_id
  JOIN clientes_cliente cl ON cl.id = c.cliente_id
  WHERE upper(replace(v.placa, ' ', '')) = upper(replace($1, ' ', ''))
  ORDER BY
    (c.estado = 'Activo') DESC,
    (c.estado = 'Retenido') DESC,
    c.fecha_inicio DESC NULLS LAST,
    c.id DESC
`;

function railwebUrl(): string {
  const urls = getDatabaseUrls();
  if (!urls[0]) throw new Error("DATABASE_URL no configurada");
  return urls[0];
}

async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const pool = getPgPool(railwebUrl());
  const { rows } = await pool.query<T>(text, params);
  return rows;
}

async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool(railwebUrl()).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export function isoHoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date());
}

export async function listDestinatariosNequi(): Promise<Destinatario[]> {
  const rows = await query(SQL_DESTINATARIOS, [MEDIO_NEQUI]);
  return rows.map((r) => ({
    configuracionId: Number(r.configuracion_id),
    cuenta: String(r.cuenta),
  }));
}

async function fetchContratos(placa: string): Promise<ContratoOpt[]> {
  const rows = await query(SQL_CONTRATOS, [placa.trim()]);
  return rows.map((r) => ({
    contratoId: Number(r.contrato_id),
    clienteId: Number(r.cliente_id),
    clienteNombre: String(r.nombre),
    cedula: String(r.cedula),
    tarifa: toInt(r.tarifa),
    frecuencia: String(r.frecuencia_pago),
  }));
}

async function fetchFacturas(contratoId: number): Promise<FacturaPendiente[]> {
  const rows = await query(SQL_FACTURAS_PENDIENTES, [contratoId]);
  return mapFacturaRows(rows);
}

function pickContrato(
  contratos: ContratoOpt[],
  contratoId?: number,
): ContratoOpt | null {
  if (!contratos.length) return null;
  if (contratoId != null) {
    return contratos.find((c) => c.contratoId === contratoId) ?? contratos[0]!;
  }
  // Ya vienen ordenados: Activo → Retenido → más reciente
  return contratos[0]!;
}

export async function previewPagoTarifa(input: {
  placa: string;
  monto: number;
  contratoId?: number;
  fechaPago?: string;
}): Promise<PreviewResult> {
  const placa = String(input.placa ?? "").trim();
  if (!placa) throw new Error("Escribe la placa.");
  const monto = Math.round(Number(input.monto) || 0);
  if (monto < 0) throw new Error("El monto no puede ser negativo.");
  const fechaPago = input.fechaPago?.trim() || isoHoyBogota();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
    throw new Error("Fecha inválida (YYYY-MM-DD).");
  }

  const contratos = await fetchContratos(placa);
  if (contratos.length === 0) {
    throw new Error(`No hay contrato para la placa ${placa.toUpperCase()}.`);
  }

  const contrato = pickContrato(contratos, input.contratoId);
  if (!contrato) {
    return { contratos, contratoId: null, facturas: [], plan: [], sobrante: 0 };
  }

  const existentes = await fetchFacturas(contrato.contratoId);
  const facturas =
    monto > 0
      ? await facturasConEmisionSimulada(
          (text, params) =>
            query(text, params).then((rows) => ({
              rows: rows as Record<string, unknown>[],
            })),
          contrato.contratoId,
          contrato.tarifa,
          fechaPago,
          monto,
          existentes,
        )
      : existentes;

  const facturasView: FacturaView[] = facturas.map((f) => ({
    id: f.id,
    fecha: f.fecha,
    total: f.total,
    saldo: f.saldo,
  }));

  const { plan, sobrante } =
    monto > 0 ? planFifo(facturas, monto) : { plan: [], sobrante: 0 };

  return {
    contratos,
    contratoId: contrato.contratoId,
    facturas: facturasView,
    plan: plan.map((a) => ({
      facturaId: a.facturaId,
      fecha: a.fecha,
      saldoAntes: a.saldoAntes,
      aplicar: a.aplicar,
      queda: a.saldoAntes - a.aplicar,
    })),
    sobrante,
  };
}

export async function registrarPagoTarifa(input: {
  placa: string;
  contratoId?: number;
  monto: number;
  referencia: string;
  fechaPago: string;
  configuracionId: number;
}): Promise<RegistrarResult> {
  const placa = String(input.placa ?? "").trim();
  if (!placa) throw new Error("Escribe la placa.");
  const monto = Math.round(Number(input.monto) || 0);
  if (monto <= 0) throw new Error("El monto debe ser mayor que cero.");
  const referencia = String(input.referencia ?? "").trim();
  if (!referencia) throw new Error("Ingresa la referencia.");
  const fechaPago = String(input.fechaPago ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
    throw new Error("Fecha inválida (YYYY-MM-DD).");
  }
  const configuracionId = Math.round(Number(input.configuracionId));
  if (!Number.isFinite(configuracionId) || configuracionId <= 0) {
    throw new Error("Destinatario inválido.");
  }

  return withTx(async (client) => {
    const canalRows = (await client.query(SQL_CANAL_NEQUI, [MEDIO_NEQUI])).rows;
    if (canalRows.length === 0) {
      throw new Error("No hay un canal activo para Transfer Nequi.");
    }
    const canalId = Number(canalRows[0]!.id);

    const destRows = (
      await client.query(
        `SELECT 1
         FROM terminal_pagos_configuracionpago cfg
         JOIN terminal_pagos_mediopago m ON m.id = cfg.medio_id
         WHERE m.nombre = $1 AND cfg.activo = true AND cfg.id = $2
         LIMIT 1`,
        [MEDIO_NEQUI, configuracionId],
      )
    ).rows;
    if (destRows.length === 0) {
      throw new Error("Destinatario inválido.");
    }

    const contratoRows = (await client.query(SQL_CONTRATOS, [placa])).rows;
    if (contratoRows.length === 0) {
      throw new Error(`No hay contrato para la placa ${placa.toUpperCase()}.`);
    }

    let contratoRow = input.contratoId
      ? contratoRows.find((c) => Number(c.contrato_id) === input.contratoId)
      : undefined;
    // Sin elección: el primero (Activo / más reciente)
    if (!contratoRow) {
      contratoRow = contratoRows[0];
    }

    const contratoId = Number(contratoRow!.contrato_id);
    const clienteId = Number(contratoRow!.cliente_id);

    const dup = (
      await client.query(
        `SELECT 1 FROM terminal_pagos_pagofactura p
         JOIN terminal_pagos_factura f ON f.id = p.factura_id
         WHERE f.contrato_id = $1 AND upper(p.referencia) = upper($2)
         LIMIT 1`,
        [contratoId, referencia],
      )
    ).rows;
    if (dup.length > 0) {
      throw new Error(
        `REPETIDA|Referencia repetida (${referencia}) · placa ${placa.toUpperCase()}`,
      );
    }

    const facturas = await ensureFacturasParaMonto(
      client,
      contratoId,
      toInt(contratoRow!.tarifa),
      fechaPago,
      monto,
    );

    const { plan, sobrante } = planFifo(facturas, monto);
    if (plan.length === 0) {
      throw new Error("No se pudo aplicar el pago a facturas de tarifa.");
    }

    const pagos: PagoAplicado[] = [];
    for (const a of plan) {
      const f = facturas.find((x) => x.id === a.facturaId)!;
      const ins = await client.query(
        `INSERT INTO terminal_pagos_pagofactura
           (valor, referencia, canal_id, configuracion_id, factura_id,
            fecha_pago, validado, es_compensacion, referencia_original)
         VALUES ($1, $2, $3, $4, $5, $6, false, false, NULL)
         RETURNING id`,
        [
          a.aplicar,
          referencia,
          canalId,
          configuracionId,
          a.facturaId,
          fechaPago,
        ],
      );
      const pagoId = Number(ins.rows[0]!.id);

      const nuevoPagado = f.pagado + a.aplicar;
      const nuevoEstado = nuevoPagado >= f.total ? "pagada" : "pendiente";
      await client.query(
        `UPDATE terminal_pagos_factura
         SET total_pagado = $1, estado_pago = $2 WHERE id = $3`,
        [nuevoPagado, nuevoEstado, a.facturaId],
      );

      pagos.push({
        pagoId,
        facturaId: a.facturaId,
        aplicado: a.aplicar,
        estado: nuevoEstado,
      });
    }

    let prepagoId: number | null = null;
    if (sobrante > 0) {
      const facturaOrigenId = plan[plan.length - 1]!.facturaId;
      const pre = await client.query(
        `INSERT INTO terminal_pagos_prepago
           (fecha, valor, saldo_disponible, estado, cliente_id, contrato_id,
            factura_origen_id, factura_aplicacion_id, usuario_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL)
         RETURNING id`,
        [
          fechaPago,
          sobrante,
          sobrante,
          ESTADO_PREPAGO,
          clienteId,
          contratoId,
          facturaOrigenId,
        ],
      );
      prepagoId = Number(pre.rows[0]!.id);
    }

    return {
      clienteNombre: String(contratoRow!.nombre),
      contratoId,
      pagos,
      sobrante,
      prepagoId,
    };
  });
}
