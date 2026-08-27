import { getDatabaseUrls } from "@/lib/dbUrls";
import {
  analizarMorosidad,
  ordenarMorosos,
  type ResultadoMoroso,
} from "@/lib/analisisMorosidad";
import { parseDiasCredito, type RegistroExtracto } from "@/lib/extractoCliente";
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
let cacheMorosos: { expira: number; data: ResultadoMoroso[] } | null = null;

export type ResumenMorosos = {
  total: number;
  sin_pago_hoy: number;
  criticos: number;
  deuda_total: number;
  generado_en: string;
};

/**
 * Prioridad cobro: cuotas mora >5 y deuda >$250k, o pago diario sin abonar deuda.
 */
export async function fetchMorososDesdeDb(
  force = false,
): Promise<{ morosos: ResultadoMoroso[]; resumen: ResumenMorosos }> {
  const ahora = Date.now();
  if (!force && cacheMorosos && cacheMorosos.expira > ahora) {
    return buildResumen(cacheMorosos.data);
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
        "[morososFromDb] Error en una base:",
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  }

  const seenPlacas = new Set<string>();
  const registrosMap = registrosPorContrato(todosRegistros);
  const morosos: ResultadoMoroso[] = [];

  for (const c of todosClientes) {
    const placaKey = normalizarPlaca(c.placa ?? "");
    if (!placaKey || placaExcluidaDeReportes(placaKey) || seenPlacas.has(placaKey)) {
      continue;
    }
    seenPlacas.add(placaKey);

    const valorCuota = Number(c.valor_cuota);
    if (!c.fecha_inicio || valorCuota <= 0) continue;

    const diasCredito = parseDiasCredito(c.fecha_final);
    if (diasCredito >= 365) continue;

    const regs = registrosMap.get(String(c.contrato_id)) ?? [];
    const resultado = analizarMorosidad({
      placa: c.placa,
      cedula: c.cedula,
      nombre: c.nombre ?? "",
      telefono: c.telefono ?? "",
      visitador: c.visitador ?? "",
      fecha_inicio: new Date(c.fecha_inicio),
      valor_cuota: valorCuota,
      dias_credito: diasCredito,
      registros: regs,
      fechas_congeladas: freezeByContrato.get(String(c.contrato_id)) ?? [],
    });

    if (resultado) morosos.push(resultado);
  }

  const ordenados = ordenarMorosos(morosos);
  cacheMorosos = { expira: ahora + CACHE_TTL_MS, data: ordenados };
  return buildResumen(ordenados);
}

function buildResumen(morosos: ResultadoMoroso[]): {
  morosos: ResultadoMoroso[];
  resumen: ResumenMorosos;
} {
  return {
    morosos,
    resumen: {
      total: morosos.length,
      sin_pago_hoy: morosos.filter((m) => !m.pago_hoy).length,
      criticos: morosos.filter((m) => m.riesgo_mora === "critico").length,
      deuda_total: morosos.reduce((s, m) => s + m.deuda_total, 0),
      generado_en: new Date().toISOString(),
    },
  };
}
