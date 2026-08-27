import { getDatabaseUrls } from "@/lib/dbUrls";
import {
  analizarPatronPago,
  type PatronPago,
} from "@/lib/analisisMorosidad";
import {
  calcularMetricasExtracto,
  parseDiasCredito,
  type RegistroExtracto,
} from "@/lib/extractoCliente";
import { placaExcluidaDeReportes } from "@/lib/placasExcluidasReportes";
import { queryPg } from "@/lib/pgPool";
import {
  SQL_CLIENTES_EXTRACTO,
  SQL_REGISTROS_EXTRACTO,
  fetchFreezeDaysPorContrato,
} from "@/lib/reporteFromDb";

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

export type ResultadoAtraso = {
  placa: string;
  cedula: string;
  nombre: string;
  telefono: string;
  visitador: string;
  fecha_inicio: string;
  valor_cuota: number;
  deuda_total: number;
  dias_mora: number;
  cuotas_pendientes: number;
  cumplimiento_pct: number;
  total_pagado: number;
  ultimo_pago: string;
  pago_hoy: boolean;
} & PatronPago;

export type ResumenAtrasos = {
  total: number;
  sin_pago_hoy: number;
  deuda_total: number;
  generado_en: string;
};

function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

function formatFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pagoEnFecha(registros: RegistroExtracto[], dia: Date): boolean {
  const key = formatFecha(startOfDay(dia));
  return registros.some((r) => formatFecha(startOfDay(r.fecha)) === key);
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
  freezeByContrato: Map<string, string[]>;
}> {
  const clientes = await queryPg<ClienteRow>(
    connectionString,
    SQL_CLIENTES_EXTRACTO,
  );
  if (!clientes.length) {
    return { clientes: [], registros: [], freezeByContrato: new Map() };
  }

  const [registros, freezeByContrato] = await Promise.all([
    queryPg<{
      contrato_id: string | number;
      fecha_registro: Date;
      valor: string | number;
      tipo: string | null;
      referencia: string | null;
    }>(connectionString, SQL_REGISTROS_EXTRACTO),
    fetchFreezeDaysPorContrato(connectionString),
  ]);

  return { clientes, registros, freezeByContrato };
}

const CACHE_TTL_MS =
  process.env.NODE_ENV === "production" ? 180_000 : 90_000;
let cacheAtrasos: { expira: number; data: ResultadoAtraso[] } | null = null;

export function analizarAtraso(
  cliente: {
    placa: string;
    cedula: string;
    nombre: string;
    telefono: string;
    visitador: string;
    fecha_inicio: Date;
    valor_cuota: number;
    fecha_final: string | null;
  },
  registros: RegistroExtracto[],
  hoy = new Date(),
  fechasCongeladas: Iterable<string> = [],
): ResultadoAtraso | null {
  if (!cliente.fecha_inicio || cliente.valor_cuota <= 0) return null;

  const diasCredito = parseDiasCredito(cliente.fecha_final);
  const metricas = calcularMetricasExtracto(
    cliente.fecha_inicio,
    cliente.valor_cuota,
    registros,
    diasCredito,
    startOfDay(hoy),
    fechasCongeladas,
  );

  if (metricas.deuda_total <= 0 && metricas.cuotas_pendientes <= 0) {
    return null;
  }

  const patron = analizarPatronPago(registros);

  return {
    placa: cliente.placa,
    cedula: cliente.cedula,
    nombre: cliente.nombre,
    telefono: cliente.telefono,
    visitador: cliente.visitador,
    fecha_inicio: formatFecha(startOfDay(cliente.fecha_inicio)),
    valor_cuota: Math.round(cliente.valor_cuota),
    deuda_total: Math.round(metricas.deuda_total),
    dias_mora: metricas.dias_mora,
    cuotas_pendientes: Math.round(metricas.cuotas_pendientes * 10) / 10,
    cumplimiento_pct: metricas.cumplimiento_pct,
    total_pagado: Math.round(metricas.total_pagado),
    ultimo_pago: metricas.ultimo_pago,
    pago_hoy: pagoEnFecha(registros, hoy),
    ...patron,
  };
}

function ordenarAtrasos(lista: ResultadoAtraso[]): ResultadoAtraso[] {
  return [...lista].sort((a, b) => {
    if (b.deuda_total !== a.deuda_total) {
      return b.deuda_total - a.deuda_total;
    }
    return b.dias_mora - a.dias_mora;
  });
}

/**
 * Reporte de atrasos: todos los clientes con deuda > 0, sin filtros de morosidad.
 */
export async function fetchAtrasosDesdeDb(
  force = false,
): Promise<{ atrasos: ResultadoAtraso[]; resumen: ResumenAtrasos }> {
  const ahora = Date.now();
  if (!force && cacheAtrasos && cacheAtrasos.expira > ahora) {
    return buildResumen(cacheAtrasos.data);
  }

  const urls = getDatabaseUrls();
  const results = await Promise.allSettled(urls.map((cs) => queryDb(cs)));

  const todosClientes: ClienteRow[] = [];
  const todosRegistros: Array<{
    contrato_id: string | number;
    fecha_registro: Date;
    valor: string | number;
    tipo: string | null;
    referencia: string | null;
  }> = [];
  const freezeByContrato = new Map<string, string[]>();

  for (const r of results) {
    if (r.status === "fulfilled") {
      todosClientes.push(...r.value.clientes);
      todosRegistros.push(...r.value.registros);
      for (const [id, fechas] of r.value.freezeByContrato) {
        const prev = freezeByContrato.get(id) ?? [];
        freezeByContrato.set(id, [...prev, ...fechas]);
      }
    } else {
      console.warn(
        "[atrasosFromDb] Error en una base:",
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  }

  const seenPlacas = new Set<string>();
  const registrosMap = registrosPorContrato(todosRegistros);
  const atrasos: ResultadoAtraso[] = [];

  for (const c of todosClientes) {
    const placaKey = normalizarPlaca(c.placa ?? "");
    if (!placaKey || placaExcluidaDeReportes(placaKey) || seenPlacas.has(placaKey)) {
      continue;
    }
    seenPlacas.add(placaKey);

    const valorCuota = Number(c.valor_cuota);
    if (!c.fecha_inicio || valorCuota <= 0) continue;

    const regs = registrosMap.get(String(c.contrato_id)) ?? [];
    const resultado = analizarAtraso(
      {
        placa: c.placa,
        cedula: c.cedula,
        nombre: c.nombre ?? "",
        telefono: c.telefono ?? "",
        visitador: c.visitador ?? "",
        fecha_inicio: new Date(c.fecha_inicio),
        valor_cuota: valorCuota,
        fecha_final: c.fecha_final,
      },
      regs,
      new Date(),
      freezeByContrato.get(String(c.contrato_id)) ?? [],
    );

    if (resultado) atrasos.push(resultado);
  }

  const ordenados = ordenarAtrasos(atrasos);
  cacheAtrasos = { expira: ahora + CACHE_TTL_MS, data: ordenados };
  return buildResumen(ordenados);
}

function buildResumen(atrasos: ResultadoAtraso[]): {
  atrasos: ResultadoAtraso[];
  resumen: ResumenAtrasos;
} {
  return {
    atrasos,
    resumen: {
      total: atrasos.length,
      sin_pago_hoy: atrasos.filter((a) => !a.pago_hoy).length,
      deuda_total: atrasos.reduce((s, a) => s + a.deuda_total, 0),
      generado_en: new Date().toISOString(),
    },
  };
}
