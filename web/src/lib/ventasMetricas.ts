import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";

export type SedeId = "bga" | "girardot" | "bogota" | "railweb";

export type VentaFila = {
  id: string;
  sede: SedeId;
  sede_label: string;
  tipo: "contado" | "credito";
  fecha: string;
  placa: string | null;
  modelo: string | null;
  cliente: string | null;
  /** Contado: valor_venta. Crédito SP: cuota_inicial. Railweb: estimado contrato. */
  valor: number;
  valor_label: string;
};

export type SedeMetricas = {
  id: SedeId;
  label: string;
  ok: boolean;
  error: string | null;
  contado_n: number;
  contado_valor: number;
  credito_n: number;
  /** SP: suma cuota_inicial. Railweb: suma valor estimado. */
  credito_valor: number;
  credito_valor_label: string;
  total_n: number;
  ventas: VentaFila[];
};

export type VentasPayload = {
  desde: string;
  hasta: string;
  generado_en: string;
  totales: {
    contado_n: number;
    contado_valor: number;
    credito_n: number;
    credito_valor_sp: number;
    credito_valor_railweb: number;
    total_n: number;
  };
  sedes: SedeMetricas[];
  ventas: VentaFila[];
};

const SEDES_SP: Array<{
  id: Exclude<SedeId, "railweb">;
  label: string;
  url: string;
  key: string;
}> = [
  {
    id: "bga",
    label: "Bucaramanga (BGA)",
    url: "https://ngjpndqmkhhdqjjljfmp.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nanBuZHFta2hoZHFqamxqZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTAzNjAsImV4cCI6MjEwMDQ4NjM2MH0.98FK60wSqwhfxbdnHM8rESkDLD6v3p0V6D6bFM3zACY",
  },
  {
    id: "girardot",
    label: "Girardot",
    url: "https://iilgrapnrkwdcouielwz.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpbGdyYXBucmt3ZGNvdWllbHd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NDEyODEsImV4cCI6MjA5NjUxNzI4MX0.82GJcFxinFQqxI8OSh40JdivYWK9hr1GRw6lyiqW_3E",
  },
  {
    id: "bogota",
    label: "Bogotá",
    url: "https://ziihqvtjacqzwmcmpiyp.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppaWhxdnRqYWNxendtY21waXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODYyODEsImV4cCI6MjA5OTU2MjI4MX0.DpEws4CRAb3B6Y35TJ7o0afxpaFu56Jfsh-9IKeCQkc",
  },
];

function ymdBogota(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Suma días a un YYYY-MM-DD interpretado en Bogotá. */
function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00-05:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return ymdBogota(d);
}

/** 1° del mes calendario anterior → hoy, America/Bogota. */
export function rangoVentas(ahora = new Date()): { desde: string; hasta: string } {
  const hasta = ymdBogota(ahora);
  const [yStr, mStr] = hasta.split("-");
  let desdeY = Number(yStr);
  let desdeM = Number(mStr) - 1;
  if (desdeM < 1) {
    desdeM = 12;
    desdeY -= 1;
  }
  const desde = `${desdeY}-${String(desdeM).padStart(2, "0")}-01`;
  return { desde, hasta };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fechaSolo(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function clientSp(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function metricasSp(
  sede: (typeof SEDES_SP)[number],
  desde: string,
  hasta: string,
): Promise<SedeMetricas> {
  const supabase = clientSp(sede.url, sede.key);
  const desdeIso = new Date(`${desde}T00:00:00-05:00`).toISOString();
  // hasta inclusive → exclusive = día siguiente 00:00 Bogotá
  const hastaExclusiveDate = addDaysYmd(hasta, 1);
  const hastaExclusiveIso = new Date(
    `${hastaExclusiveDate}T00:00:00-05:00`,
  ).toISOString();

  const [contadoRes, creditoRes] = await Promise.all([
    supabase
      .from("ventas_moto")
      .select(
        "id, modelo, placa, cliente_nombre, valor_venta, monto_pagado, created_at",
      )
      .gte("created_at", desdeIso)
      .lt("created_at", hastaExclusiveIso)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_moto_compra")
      .select(
        "id, modelo, placa, cuota_inicial_monto, monto_cuota_periodo, fecha_entrega, estado",
      )
      .in("estado", ["entregada", "saldada"])
      .gte("fecha_entrega", desde)
      .lt("fecha_entrega", hastaExclusiveDate)
      .order("fecha_entrega", { ascending: false }),
  ]);

  if (contadoRes.error) throw new Error(contadoRes.error.message);
  if (creditoRes.error) throw new Error(creditoRes.error.message);

  const ventas: VentaFila[] = [];

  for (const row of contadoRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const valor = num(r.valor_venta);
    ventas.push({
      id: `contado-${sede.id}-${String(r.id)}`,
      sede: sede.id,
      sede_label: sede.label,
      tipo: "contado",
      fecha: fechaSolo(r.created_at),
      placa: r.placa != null ? String(r.placa) : null,
      modelo: r.modelo != null ? String(r.modelo) : null,
      cliente: r.cliente_nombre != null ? String(r.cliente_nombre) : null,
      valor,
      valor_label: "valor_venta",
    });
  }

  for (const row of creditoRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const valor = num(r.cuota_inicial_monto);
    ventas.push({
      id: `credito-${sede.id}-${String(r.id)}`,
      sede: sede.id,
      sede_label: sede.label,
      tipo: "credito",
      fecha: fechaSolo(r.fecha_entrega),
      placa: r.placa != null ? String(r.placa) : null,
      modelo: r.modelo != null ? String(r.modelo) : null,
      cliente: null,
      valor,
      valor_label: "cuota_inicial",
    });
  }

  ventas.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const contado = ventas.filter((v) => v.tipo === "contado");
  const credito = ventas.filter((v) => v.tipo === "credito");

  return {
    id: sede.id,
    label: sede.label,
    ok: true,
    error: null,
    contado_n: contado.length,
    contado_valor: contado.reduce((s, v) => s + v.valor, 0),
    credito_n: credito.length,
    credito_valor: credito.reduce((s, v) => s + v.valor, 0),
    credito_valor_label: "cuotas iniciales",
    total_n: ventas.length,
    ventas,
  };
}

type RailwebRow = {
  id: string | number;
  fecha_inicio: string;
  placa: string | null;
  modelo: string | null;
  cliente: string | null;
  cuota_inicial: number | string;
  tarifa: number | string;
  dias_contrato: number | string;
  valor_estimado: number | string;
};

async function metricasRailweb(
  desde: string,
  hasta: string,
): Promise<SedeMetricas> {
  const url = getDatabaseUrls()[0];
  if (!url) throw new Error("DATABASE_URL no configurada");

  // ponytail: SELECT only — no writes; excluye renovaciones/cambio titular
  const rows = await queryPg<RailwebRow>(
    url,
    `
    SELECT
      ct.id,
      ct.fecha_inicio::text AS fecha_inicio,
      v.placa,
      v.modelo,
      cl.nombre AS cliente,
      ct.cuota_inicial,
      ct.tarifa,
      ct.dias_contrato,
      (ct.tarifa * ct.dias_contrato + ct.cuota_inicial) AS valor_estimado
    FROM arrendamientos_contrato ct
    JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
    JOIN clientes_cliente cl ON cl.id = ct.cliente_id
    LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
    WHERE ct.tipo_contrato = 'opcion_compra'
      AND ct.fecha_inicio >= $1::date
      AND ct.fecha_inicio <= $2::date
      AND COALESCE(ven.nombre, '') NOT ILIKE '%RENOVACION%'
      AND COALESCE(ven.nombre, '') NOT ILIKE '%CAMBIO TITULAR%'
    ORDER BY ct.fecha_inicio DESC
    `,
    [desde, hasta],
  );

  const ventas: VentaFila[] = rows.map((r) => ({
    id: `credito-railweb-${String(r.id)}`,
    sede: "railweb" as const,
    sede_label: "Railweb (Julian)",
    tipo: "credito" as const,
    fecha: fechaSolo(r.fecha_inicio),
    placa: r.placa,
    modelo: r.modelo,
    cliente: r.cliente,
    valor: num(r.valor_estimado),
    valor_label: "estimado (inicial + tarifa×días)",
  }));

  return {
    id: "railweb",
    label: "Railweb (Julian)",
    ok: true,
    error: null,
    contado_n: 0,
    contado_valor: 0,
    credito_n: ventas.length,
    credito_valor: ventas.reduce((s, v) => s + v.valor, 0),
    credito_valor_label: "estimado contrato",
    total_n: ventas.length,
    ventas,
  };
}

function sedeVacia(
  id: SedeId,
  label: string,
  error: string,
): SedeMetricas {
  return {
    id,
    label,
    ok: false,
    error,
    contado_n: 0,
    contado_valor: 0,
    credito_n: 0,
    credito_valor: 0,
    credito_valor_label: id === "railweb" ? "estimado contrato" : "cuotas iniciales",
    total_n: 0,
    ventas: [],
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout ${ms}ms: ${label}`)),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Consulta las 4 fuentes en paralelo. Solo lectura. */
export async function cargarMetricasVentas(
  ahora = new Date(),
): Promise<VentasPayload> {
  const { desde, hasta } = rangoVentas(ahora);

  // ponytail: 25s/sede — si Railway cuelga, el resto igual responde
  const results = await Promise.allSettled([
    ...SEDES_SP.map((s) =>
      withTimeout(metricasSp(s, desde, hasta), 25_000, s.id),
    ),
    withTimeout(metricasRailweb(desde, hasta), 25_000, "railweb"),
  ]);

  const sedes: SedeMetricas[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
    if (i < SEDES_SP.length) {
      return sedeVacia(SEDES_SP[i].id, SEDES_SP[i].label, msg);
    }
    return sedeVacia("railweb", "Railweb (Julian)", msg);
  });

  const ventas = sedes
    .flatMap((s) => s.ventas)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const creditoSp = sedes
    .filter((s) => s.id !== "railweb")
    .reduce((sum, s) => sum + s.credito_valor, 0);
  const rail = sedes.find((s) => s.id === "railweb");

  return {
    desde,
    hasta,
    generado_en: ahora.toISOString(),
    totales: {
      contado_n: sedes.reduce((s, z) => s + z.contado_n, 0),
      contado_valor: sedes.reduce((s, z) => s + z.contado_valor, 0),
      credito_n: sedes.reduce((s, z) => s + z.credito_n, 0),
      credito_valor_sp: creditoSp,
      credito_valor_railweb: rail?.credito_valor ?? 0,
      total_n: sedes.reduce((s, z) => s + z.total_n, 0),
    },
    sedes,
    ventas,
  };
}
