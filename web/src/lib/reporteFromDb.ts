import { Pool } from "pg";

import {
  calcularMetricasExtracto,
  type RegistroExtracto,
} from "@/lib/extractoCliente";

/** Mismas consultas que `client_report.py` (SQL_CLIENTES_ACTIVOS / SQL_REGISTROS_LOTE). */
export const SQL_CLIENTES_EXTRACTO = `
SELECT
    c.cedula,
    c.nombre,
    c.placa,
    c.telefono,
    c.visitador,
    c.fecha_inicio::date AS fecha_inicio,
    c.valor_cuota::numeric AS valor_cuota
FROM clientes c
WHERE c.estado = 'activo'
  AND c.fecha_inicio IS NOT NULL
  AND c.valor_cuota > 0
`;

export const SQL_REGISTROS_EXTRACTO = `
SELECT
    r.cedula,
    r.fecha_registro::date AS fecha_registro,
    r.valor::numeric AS valor,
    r.tipo,
    r.referencia
FROM registros r
WHERE r.cedula = ANY($1::text[])
ORDER BY r.cedula, r.fecha_registro
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

function fechaAString(v: unknown): string {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return v == null ? "" : String(v);
}

function registrosPorCedula(
  rows: Array<{
    cedula: string;
    fecha_registro: Date;
    valor: string | number;
    tipo: string | null;
    referencia: string | null;
  }>,
): Map<string, RegistroExtracto[]> {
  const map = new Map<string, RegistroExtracto[]>();
  for (const row of rows) {
    if (row.fecha_registro == null || row.valor == null) continue;
    const lista = map.get(row.cedula) ?? [];
    lista.push({
      fecha: new Date(row.fecha_registro),
      valor: Number(row.valor),
      tipo: row.tipo ?? "",
      referencia: row.referencia ?? "",
    });
    map.set(row.cedula, lista);
  }
  return map;
}

async function queryDb(
  connectionString: string,
): Promise<{
  clientes: Array<{
    cedula: string;
    nombre: string;
    placa: string;
    telefono: string | null;
    visitador: string | null;
    fecha_inicio: Date;
    valor_cuota: string | number;
  }>;
  registros: Array<{
    cedula: string;
    fecha_registro: Date;
    valor: string | number;
    tipo: string | null;
    referencia: string | null;
  }>;
}> {
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 5_000,
  });

  try {
    const { rows: clientes } = await pool.query<{
      cedula: string;
      nombre: string;
      placa: string;
      telefono: string | null;
      visitador: string | null;
      fecha_inicio: Date;
      valor_cuota: string | number;
    }>(SQL_CLIENTES_EXTRACTO);

    if (!clientes.length) return { clientes: [], registros: [] };

    const cedulas = clientes.map((c) => c.cedula);
    const { rows: registros } = await pool.query<{
      cedula: string;
      fecha_registro: Date;
      valor: string | number;
      tipo: string | null;
      referencia: string | null;
    }>(SQL_REGISTROS_EXTRACTO, [cedulas]);

    return { clientes, registros };
  } finally {
    await pool.end();
  }
}

type ClienteRow = {
  cedula: string;
  nombre: string;
  placa: string;
  telefono: string | null;
  visitador: string | null;
  fecha_inicio: Date;
  valor_cuota: string | number;
};

/** Consulta múltiples bases de datos (varios puntos de venta) y fusiona resultados. */
export async function fetchReporteFilasDesdeDb(
  connectionStrings: string[],
): Promise<Record<string, string>[]> {
  const results = await Promise.allSettled(
    connectionStrings.map((cs) => queryDb(cs)),
  );

  const todosClientes: ClienteRow[] = [];
  const todosRegistros: Array<{
    cedula: string;
    fecha_registro: Date;
    valor: string | number;
    tipo: string | null;
    referencia: string | null;
  }> = [];

  for (const r of results) {
    if (r.status === "fulfilled") {
      todosClientes.push(...r.value.clientes);
      todosRegistros.push(...r.value.registros);
    } else {
      console.warn(
        "[reporteFromDb] Error en una base:",
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  }

  if (!todosClientes.length) return [];

  const seen = new Set<string>();
  const clientesUnicos: ClienteRow[] = [];
  for (const c of todosClientes) {
    if (!seen.has(c.cedula)) {
      seen.add(c.cedula);
      clientesUnicos.push(c);
    }
  }

  const registrosMap = registrosPorCedula(todosRegistros);
  const filas: Record<string, string>[] = [];

  for (const c of clientesUnicos) {
    const valorCuota = Number(c.valor_cuota);
    if (!c.fecha_inicio || valorCuota <= 0) continue;

    const regs = registrosMap.get(c.cedula) ?? [];
    const m = calcularMetricasExtracto(
      new Date(c.fecha_inicio),
      valorCuota,
      regs,
    );

    const out: Record<string, string> = {
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
      deuda_total: String(Math.round(m.deuda_total)),
      ultimo_pago: m.ultimo_pago,
      dias_mora: String(m.dias_mora),
      cumplimiento_pct: String(m.cumplimiento_pct),
    };

    for (const k of COLUMNAS) {
      if (!(k in out)) out[k] = "";
    }
    filas.push(out);
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
