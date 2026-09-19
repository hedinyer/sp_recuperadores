import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import { clientSp, SEDES_SP } from "@/lib/spSedes";
import {
  forecastUnidades,
  sumarForecasts,
  type ForecastResult,
  type SerieDiariaPunto,
} from "@/lib/ventasForecast";
import { filtrarUltimosDias, hoyBogota, normalizarColor, normalizarFrecuencia, normalizarModelo } from "@/lib/ventasMix";
import type { SedeId, TotalesKpi, VentaFila, VentanaDias } from "@/lib/ventasTipos";

export type { SedeId, TotalesKpi, VentaFila, VentanaDias };

function campoModelo(v: unknown): string | null {
  const n = normalizarModelo(v != null ? String(v) : null);
  return n === "Sin dato" ? null : n;
}
function campoColor(v: unknown): string | null {
  const n = normalizarColor(v != null ? String(v) : null);
  return n === "Sin dato" ? null : n;
}
function campoFreq(v: unknown): string | null {
  const n = normalizarFrecuencia(v != null ? String(v) : null);
  return n === "Sin dato" ? null : n;
}

export type SedeMetricas = {
  id: SedeId;
  label: string;
  ok: boolean;
  error: string | null;
  contado_n: number;
  contado_valor: number;
  credito_n: number;
  credito_inicial: number;
  credito_estimado: number;
  total_n: number;
  /** Detalle solo del periodo KPI. */
  ventas: VentaFila[];
};

export type DiaSerie = {
  fecha: string;
  unidades: number;
  estimado_cop: number;
  contado_n: number;
  credito_n: number;
  by_sede: Record<SedeId, { unidades: number; estimado_cop: number }>;
};

export type VentasPayload = {
  desde: string;
  hasta: string;
  generado_en: string;
  historia_desde: string | null;
  totales: TotalesKpi;
  /** Periodo KPI anterior de igual duración (para Δ). */
  totales_prev: TotalesKpi;
  sedes: SedeMetricas[];
  /** Detalle del periodo KPI (no toda la historia). */
  ventas: VentaFila[];
  serie: DiaSerie[];
  forecast: ForecastResult;
  forecast_por_sede: Record<SedeId, ForecastResult>;
  /**
   * Ventas recientes (hasta 240 días = máx. ventana 120 + periodo anterior).
   * El cliente agrega KPIs / mix según la ventana.
   */
  ventas_recientes: VentaFila[];
};

const SEDE_ORDER: SedeId[] = ["bga", "girardot", "bogota", "railweb"];

const SEDE_LABEL: Record<SedeId, string> = {
  bga: "Bucaramanga (BGA)",
  girardot: "Girardot",
  bogota: "Bogotá",
  railweb: "Railweb (Julian)",
};

function ymdBogota(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function addDaysYmd(ymd: string, days: number): string {
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

function diasEntreInclusive(desde: string, hasta: string): number {
  const a = new Date(`${desde}T12:00:00-05:00`).getTime();
  const b = new Date(`${hasta}T12:00:00-05:00`).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fechaSolo(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // Timestamps ISO → día en America/Bogota (no prefijo UTC).
  if (s.includes("T") || /[Zz]|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return ymdBogota(d);
  }
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/** Fecha de venta a crédito SP = día en que se confirmó la cuota inicial. */
function fechaCreditoSp(r: Record<string, unknown>): string {
  const iniAt = fechaSolo(r.pago_inicial_confirmado_at);
  if (iniAt) return iniAt;
  const fe = fechaSolo(r.fecha_entrega);
  if (fe) return fe;
  if (r.seleccionado_at == null) return "";
  return ymdBogota(new Date(String(r.seleccionado_at)));
}

function periodosAnuales(frecuencia: unknown): number {
  switch (String(frecuencia ?? "").toLowerCase()) {
    case "diario":
      return 365;
    case "semanal":
      return 52;
    case "quincenal":
      return 24;
    case "mensual":
      return 12;
    default:
      return 365;
  }
}

function estimadoContratoSp(r: Record<string, unknown>): number {
  const inicial = num(r.cuota_inicial_monto);
  const cuota = num(r.monto_cuota_periodo);
  return inicial + cuota * periodosAnuales(r.frecuencia_pago);
}

async function fetchAllPages<T extends Record<string, unknown>>(
  run: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; from < 50_000; from += page) {
    const { data, error } = await run(from, from + page - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

async function historialSp(
  sede: (typeof SEDES_SP)[number],
): Promise<VentaFila[]> {
  const supabase = clientSp(sede.url, sede.key);

  const [contadoRows, creditoRows, pagosCuota] = await Promise.all([
    fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("ventas_moto")
        .select(
          "id, modelo, color, placa, cliente_nombre, valor_venta, monto_pagado, created_at",
        )
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("user_moto_compra")
        .select(
          "id, modelo, color, placa, cuota_inicial_monto, monto_cuota_periodo, frecuencia_pago, fecha_entrega, seleccionado_at, estado, pago_inicial_confirmado, pago_inicial_confirmado_at",
        )
        .neq("estado", "cancelada")
        .order("seleccionado_at", { ascending: true })
        .range(from, to),
    ),
    // Venta crédito = ≥1 pago de cuota (adelantada del 1er pago o tarifa periódica).
    fetchAllPages<Record<string, unknown>>((from, to) =>
      supabase
        .from("pagos")
        .select("user_moto_compra_id, contexto_pago, estado")
        .eq("estado", "confirmado")
        .in("contexto_pago", ["tarifa", "producto_cuota", "cuota_adelantada"])
        .range(from, to),
    ),
  ]);

  const conCuota = new Set<string>();
  for (const p of pagosCuota) {
    if (p.user_moto_compra_id == null) continue;
    conCuota.add(String(p.user_moto_compra_id));
  }

  const ventas: VentaFila[] = [];

  for (const r of contadoRows) {
    ventas.push({
      id: `contado-${sede.id}-${String(r.id)}`,
      sede: sede.id,
      sede_label: sede.label,
      tipo: "contado",
      fecha: fechaSolo(r.created_at),
      placa: r.placa != null ? String(r.placa) : null,
      modelo: campoModelo(r.modelo),
      color: campoColor(r.color),
      frecuencia: null,
      cliente: r.cliente_nombre != null ? String(r.cliente_nombre) : null,
      valor: num(r.valor_venta),
      valor_label: "valor_venta",
    });
  }

  for (const r of creditoRows) {
    if (!conCuota.has(String(r.id))) continue;
    const fecha = fechaCreditoSp(r);
    if (!fecha) continue;
    const inicial = num(r.cuota_inicial_monto);
    const estimado = estimadoContratoSp(r);
    ventas.push({
      id: `credito-${sede.id}-${String(r.id)}`,
      sede: sede.id,
      sede_label: sede.label,
      tipo: "credito",
      fecha,
      placa: r.placa != null ? String(r.placa) : null,
      modelo: campoModelo(r.modelo),
      color: campoColor(r.color),
      frecuencia: campoFreq(r.frecuencia_pago),
      cliente: null,
      valor: estimado,
      inicial,
      cuota_periodo: num(r.monto_cuota_periodo),
      valor_label: "estimado (inicial + cuotas año)",
    });
  }

  return ventas;
}

type RailwebRow = {
  id: string | number;
  fecha_inicio: string;
  placa: string | null;
  /** Año del vehículo en Railweb — no usar como línea comercial. */
  modelo: string | null;
  /** Línea: Nkd 125, Sbr 150, Chr 125, Milan 150… */
  serie: string | null;
  marca: string | null;
  color: string | null;
  cliente: string | null;
  cuota_inicial: number | string;
  tarifa: number | string;
  dias_contrato: number | string;
  frecuencia_pago: string | null;
  valor_estimado: number | string;
};

async function historialRailweb(): Promise<VentaFila[]> {
  const url = getDatabaseUrls()[0];
  if (!url) throw new Error("DATABASE_URL no configurada");

  // Venta = opcion_compra con ≥1 factura de ítem tarifa (cuota) pagada.
  // Fecha = fecha_inicio del contrato. Railweb: modelo=año; serie=línea.
  const rows = await queryPg<RailwebRow>(
    url,
    `
    SELECT
      ct.id,
      ct.fecha_inicio::text AS fecha_inicio,
      v.placa,
      v.modelo,
      v.serie,
      v.marca,
      v.color,
      cl.nombre AS cliente,
      ct.cuota_inicial,
      ct.tarifa,
      ct.dias_contrato,
      ct.frecuencia_pago,
      (ct.tarifa * ct.dias_contrato + ct.cuota_inicial) AS valor_estimado
    FROM arrendamientos_contrato ct
    JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
    JOIN clientes_cliente cl ON cl.id = ct.cliente_id
    LEFT JOIN clientes_vendedor ven ON ven.id = ct.vendedor_id
    WHERE ct.tipo_contrato = 'opcion_compra'
      AND COALESCE(ven.nombre, '') NOT ILIKE '%RENOVACION%'
      AND COALESCE(ven.nombre, '') NOT ILIKE '%CAMBIO TITULAR%'
      AND EXISTS (
        SELECT 1
        FROM terminal_pagos_factura f
        JOIN terminal_pagos_itemfactura i
          ON i.factura_id = f.id AND i.tipo_item = 'tarifa'
        WHERE f.contrato_id = ct.id
          AND lower(f.estado) <> 'anulada'
          AND f.estado_pago = 'pagada'
          AND COALESCE(i.subtotal, 0) > 0
      )
    ORDER BY ct.fecha_inicio ASC
    `,
  );

  return rows.map((r) => {
    const serie = (r.serie ?? "").trim();
    const marca = (r.marca ?? "").trim();
    return {
      id: `credito-railweb-${String(r.id)}`,
      sede: "railweb" as const,
      sede_label: SEDE_LABEL.railweb,
      tipo: "credito" as const,
      fecha: fechaSolo(r.fecha_inicio),
      placa: r.placa,
      modelo: campoModelo(serie || marca || null),
      color: campoColor(r.color),
      frecuencia: campoFreq(r.frecuencia_pago),
      cliente: r.cliente,
      valor: num(r.valor_estimado),
      inicial: num(r.cuota_inicial),
      cuota_periodo: num(r.tarifa),
      valor_label: "estimado (inicial + tarifa×días)",
    };
  });
}

function filtrarPeriodo(ventas: VentaFila[], desde: string, hasta: string) {
  return ventas.filter((v) => v.fecha >= desde && v.fecha <= hasta);
}

function metricasDeVentas(
  id: SedeId,
  label: string,
  ventasPeriodo: VentaFila[],
  ok: boolean,
  error: string | null,
): SedeMetricas {
  const contado = ventasPeriodo.filter((v) => v.tipo === "contado");
  const credito = ventasPeriodo.filter((v) => v.tipo === "credito");
  return {
    id,
    label,
    ok,
    error,
    contado_n: contado.length,
    contado_valor: contado.reduce((s, v) => s + v.valor, 0),
    credito_n: credito.length,
    credito_inicial: credito.reduce((s, v) => s + (v.inicial ?? 0), 0),
    credito_estimado: credito.reduce((s, v) => s + v.valor, 0),
    total_n: ventasPeriodo.length,
    ventas: [...ventasPeriodo].sort((a, b) =>
      a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0,
    ),
  };
}

function totalesDeSedes(sedes: SedeMetricas[]): TotalesKpi {
  const creditoSp = sedes
    .filter((s) => s.id !== "railweb")
    .reduce((sum, s) => sum + s.credito_inicial, 0);
  const rail = sedes.find((s) => s.id === "railweb");
  return {
    contado_n: sedes.reduce((s, z) => s + z.contado_n, 0),
    contado_valor: sedes.reduce((s, z) => s + z.contado_valor, 0),
    credito_n: sedes.reduce((s, z) => s + z.credito_n, 0),
    credito_valor_sp: creditoSp,
    credito_valor_railweb: rail?.credito_estimado ?? 0,
    credito_estimado_total: sedes.reduce((s, z) => s + z.credito_estimado, 0),
    credito_inicial_total: sedes.reduce((s, z) => s + z.credito_inicial, 0),
    total_n: sedes.reduce((s, z) => s + z.total_n, 0),
  };
}

function emptyBySede(): Record<SedeId, { unidades: number; estimado_cop: number }> {
  return {
    bga: { unidades: 0, estimado_cop: 0 },
    girardot: { unidades: 0, estimado_cop: 0 },
    bogota: { unidades: 0, estimado_cop: 0 },
    railweb: { unidades: 0, estimado_cop: 0 },
  };
}

function construirSerie(ventas: VentaFila[]): DiaSerie[] {
  if (ventas.length === 0) return [];
  const fechas = ventas.map((v) => v.fecha).filter(Boolean).sort();
  const min = fechas[0];
  const max = fechas[fechas.length - 1];
  const bucket = new Map<string, DiaSerie>();
  let cur = min;
  for (let i = 0; i < 4000 && cur <= max; i++) {
    bucket.set(cur, {
      fecha: cur,
      unidades: 0,
      estimado_cop: 0,
      contado_n: 0,
      credito_n: 0,
      by_sede: emptyBySede(),
    });
    cur = addDaysYmd(cur, 1);
  }
  for (const v of ventas) {
    if (!v.fecha) continue;
    const day = bucket.get(v.fecha);
    if (!day) continue;
    day.unidades += 1;
    day.estimado_cop += v.tipo === "credito" ? v.valor : v.valor;
    if (v.tipo === "contado") day.contado_n += 1;
    else day.credito_n += 1;
    day.by_sede[v.sede].unidades += 1;
    day.by_sede[v.sede].estimado_cop += v.valor;
  }
  return [...bucket.values()];
}

function seriePorSede(
  ventas: VentaFila[],
  sede: SedeId,
): SerieDiariaPunto[] {
  const mine = ventas.filter((v) => v.sede === sede);
  if (mine.length === 0) return [];
  const map = new Map<string, SerieDiariaPunto>();
  for (const v of mine) {
    if (!v.fecha) continue;
    const cur = map.get(v.fecha) ?? {
      fecha: v.fecha,
      unidades: 0,
      estimado_cop: 0,
      contado_n: 0,
      credito_n: 0,
    };
    cur.unidades += 1;
    cur.estimado_cop += v.valor;
    if (v.tipo === "contado") cur.contado_n += 1;
    else cur.credito_n += 1;
    map.set(v.fecha, cur);
  }
  return [...map.values()].sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0,
  );
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

/** Consulta las 4 fuentes (historia completa). Solo lectura. */
export async function cargarMetricasVentas(
  ahora = new Date(),
): Promise<VentasPayload> {
  const { desde, hasta } = rangoVentas(ahora);
  const len = diasEntreInclusive(desde, hasta);
  const prevHasta = addDaysYmd(desde, -1);
  const prevDesde = addDaysYmd(prevHasta, -(len - 1));

  // ponytail: 45s/sede — historia completa puede ser más lenta
  const results = await Promise.allSettled([
    ...SEDES_SP.map((s) => withTimeout(historialSp(s), 45_000, s.id)),
    withTimeout(historialRailweb(), 45_000, "railweb"),
  ]);

  const histPorSede: Record<SedeId, VentaFila[]> = {
    bga: [],
    girardot: [],
    bogota: [],
    railweb: [],
  };
  const errors: Partial<Record<SedeId, string>> = {};

  results.forEach((r, i) => {
    const id: SedeId =
      i < SEDES_SP.length ? SEDES_SP[i].id : "railweb";
    if (r.status === "fulfilled") {
      histPorSede[id] = r.value;
    } else {
      errors[id] =
        r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  });

  const historial = SEDE_ORDER.flatMap((id) => histPorSede[id]);
  const serie = construirSerie(historial);

  const sedes = SEDE_ORDER.map((id) =>
    metricasDeVentas(
      id,
      SEDE_LABEL[id],
      filtrarPeriodo(histPorSede[id], desde, hasta),
      !errors[id],
      errors[id] ?? null,
    ),
  );

  const sedesPrev = SEDE_ORDER.map((id) =>
    metricasDeVentas(
      id,
      SEDE_LABEL[id],
      filtrarPeriodo(histPorSede[id], prevDesde, prevHasta),
      !errors[id],
      errors[id] ?? null,
    ),
  );

  const ventas = sedes
    .flatMap((s) => s.ventas)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

  const forecast_por_sede = {} as Record<SedeId, ForecastResult>;
  for (const id of SEDE_ORDER) {
    forecast_por_sede[id] = forecastUnidades(seriePorSede(historial, id), 30);
  }
  const forecast = sumarForecasts(forecast_por_sede);

  const fechasHist = historial.map((v) => v.fecha).filter(Boolean).sort();

  return {
    desde,
    hasta,
    generado_en: ahora.toISOString(),
    historia_desde: fechasHist[0] ?? null,
    totales: totalesDeSedes(sedes),
    totales_prev: totalesDeSedes(sedesPrev),
    sedes,
    ventas,
    serie,
    forecast,
    forecast_por_sede,
    ventas_recientes: filtrarUltimosDias(historial, 240, hoyBogota(ahora)),
  };
}
