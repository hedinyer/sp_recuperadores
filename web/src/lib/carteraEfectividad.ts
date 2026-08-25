import { getDatabaseUrls } from "@/lib/dbUrls";
import { montoDesdeGestion } from "@/lib/carteraKpis";
import { etiquetaCarteraStatus } from "@/lib/carteraPerfiles";
import {
  etiquetaBucket,
  etiquetaSugerencia,
  type BucketPago,
  type ClienteEfect,
  type Episodio,
  type MetodoStats,
  type OutcomeTipo,
  type ResumenEfect,
} from "@/lib/carteraEfectividadLabels";
import { queryPg } from "@/lib/pgPool";
import { supabase } from "@/lib/supabase";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

export type {
  BucketPago,
  ClienteEfect,
  Episodio,
  MetodoStats,
  OutcomeTipo,
  ResumenEfect,
};
export { etiquetaBucket, etiquetaSugerencia };

export type GestionEfect = {
  id?: number;
  placa: string;
  perfil_id: string;
  status: string;
  created_at: string;
  notas?: string | null;
  monto?: number | null;
  categoria?: string | null;
};

export type PagoErp = {
  fecha: string; // YYYY-MM-DD Bogotá-ish (date from ERP)
  valor: number;
};

export type ResultadoEfectividad = {
  clientes: ClienteEfect[];
  metodos: MetodoStats[];
  resumen: ResumenEfect;
  generado_en: string;
};

const PESO: Record<string, number> = {
  pendiente: 0.5,
  contactado: 1,
  compromiso: 1,
  no_contesta: 1,
  visita: 2,
  en_ruta: 3,
  abono: 0,
  recuperada: 0,
  cerrado: 0,
};

const OUTCOME_STATUS = new Set(["abono", "recuperada", "cerrado"]);

const FALLBACK_SUGERENCIA = ["contactado", "compromiso", "visita"] as const;

const DIAS_VENTANA = 60;
const MAX_PLACAS = 200;
const MIN_MUESTRAS_SUGERENCIA = 5;

export function pesoStatus(status: string): number {
  return PESO[status] ?? 1;
}

export function diaBogota(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function diasEntre(aYmd: string, bYmd: string): number {
  const a = new Date(`${aYmd}T12:00:00-05:00`).getTime();
  const b = new Date(`${bYmd}T12:00:00-05:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function bucketDesdeDias(dias: number | null): BucketPago {
  if (dias == null) return "sin_pago";
  if (dias <= 0) return "mismo_dia";
  if (dias === 1) return "dia_siguiente";
  if (dias <= 7) return "2_7";
  return "8_plus";
}

function esfuerzoDe(gestiones: GestionEfect[]): number {
  return gestiones.reduce((s, g) => s + pesoStatus(g.status), 0);
}

function mediana(nums: number[]): number | null {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

/** Instantánea ERP para comparar con abono (mediodía Bogotá). */
function erpInstant(ymd: string): number {
  return new Date(`${ymd}T12:00:00-05:00`).getTime();
}

/**
 * Construye episodios de una placa a partir de gestiones + pagos ERP.
 * Pure / testeable.
 */
export function construirEpisodios(
  gestionesIn: GestionEfect[],
  erpPagos: PagoErp[],
): Episodio[] {
  const gestiones = [...gestionesIn].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const erps = [...erpPagos]
    .filter((p) => p.valor > 0 && p.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const episodios: Episodio[] = [];
  let i = 0;

  while (i < gestiones.length) {
    const start = gestiones[i]!;
    const startDay = diaBogota(start.created_at);
    const startMs = new Date(start.created_at).getTime();

    let outcome: OutcomeTipo | null = null;
    let finAt: string | null = null;
    let finMs = Infinity;
    let endExclusive = gestiones.length; // index after last gestión in episode
    let montoErp = 0;
    let montoAbono = 0;

    // Candidate: gestión outcome
    for (let j = i; j < gestiones.length; j++) {
      const g = gestiones[j]!;
      if (!OUTCOME_STATUS.has(g.status)) continue;
      const t = new Date(g.created_at).getTime();
      if (t < finMs) {
        finMs = t;
        finAt = g.created_at;
        outcome = g.status as OutcomeTipo;
        endExclusive = j + 1;
        montoAbono =
          g.status === "abono" ? montoDesdeGestion(g) : 0;
      }
      break; // first outcome gestión ends the search among gestiones
    }

    // Candidate: first ERP on/after start day
    for (const p of erps) {
      if (p.fecha < startDay) continue;
      const t = erpInstant(p.fecha);
      if (t < startMs - 1) continue;
      if (t < finMs) {
        finMs = t;
        finAt = `${p.fecha}T17:00:00-05:00`;
        outcome = "erp";
        montoErp = Math.round(p.valor);
        montoAbono = 0;
        // gestiones included: those with created_at <= fin
        endExclusive = i;
        for (let j = i; j < gestiones.length; j++) {
          if (new Date(gestiones[j]!.created_at).getTime() <= finMs) {
            endExclusive = j + 1;
          } else break;
        }
      }
      break;
    }

    const slice = gestiones.slice(i, endExclusive === i ? gestiones.length : endExclusive);
    // If no outcome, open episode = rest of gestiones
    const abierto = outcome == null;
    const enEpisodio = abierto ? gestiones.slice(i) : slice;

    if (!enEpisodio.length) break;

    const lastBeforeOutcome = [...enEpisodio]
      .reverse()
      .find((g) => !OUTCOME_STATUS.has(g.status) || g.status === outcome);
    const lastTouch =
      outcome === "abono" || outcome === "erp"
        ? [...enEpisodio]
            .reverse()
            .find((g) => g.status !== "abono")?.status ?? null
        : outcome;

    const finDay = finAt ? diaBogota(finAt) : null;
    const dias = finDay ? diasEntre(startDay, finDay) : null;
    const monto =
      outcome === "abono"
        ? montoAbono ||
          enEpisodio
            .filter((g) => g.status === "abono")
            .reduce((s, g) => s + montoDesdeGestion(g), 0)
        : outcome === "erp"
          ? montoErp
          : 0;

    // Sum additional abonos in window for abono outcome
    let montoRec = monto;
    if (outcome === "abono") {
      montoRec = enEpisodio
        .filter((g) => g.status === "abono")
        .reduce((s, g) => s + montoDesdeGestion(g), 0);
    }

    const esfuerzo = Math.max(esfuerzoDe(enEpisodio), 0.5);
    const categoria =
      [...enEpisodio].reverse().find((g) => g.categoria)?.categoria ?? null;

    episodios.push({
      placa: start.placa,
      inicio_at: start.created_at,
      fin_at: finAt,
      cerrado: !abierto,
      outcome,
      dias_hasta_pago: dias,
      bucket: bucketDesdeDias(dias),
      n_gestiones: enEpisodio.length,
      monto_recuperado: montoRec,
      esfuerzo,
      recompensa: montoRec / esfuerzo,
      last_touch: lastTouch,
      categoria,
      sugerencia: null,
    });

    if (abierto) break;
    i = Math.max(endExclusive, i + 1);
  }

  return episodios;
}

export function agregarMetodos(episodios: Episodio[]): MetodoStats[] {
  const map = new Map<
    string,
    {
      usos: number;
      conv: number;
      montoSum: number;
      diasSum: number;
      diasN: number;
      recompSum: number;
    }
  >();

  for (const ep of episodios) {
    if (!ep.cerrado || !ep.last_touch) continue;
    const key = ep.last_touch;
    const row = map.get(key) ?? {
      usos: 0,
      conv: 0,
      montoSum: 0,
      diasSum: 0,
      diasN: 0,
      recompSum: 0,
    };
    row.usos += 1;
    const pago =
      ep.outcome === "abono" ||
      ep.outcome === "erp" ||
      ep.outcome === "recuperada";
    if (pago) {
      row.conv += 1;
      row.montoSum += ep.monto_recuperado;
      row.recompSum += ep.recompensa;
      if (ep.dias_hasta_pago != null) {
        row.diasSum += ep.dias_hasta_pago;
        row.diasN += 1;
      }
    }
    map.set(key, row);
  }

  return [...map.entries()]
    .map(([status, r]) => ({
      status,
      label: etiquetaCarteraStatus(status),
      usos_last_touch: r.usos,
      conversiones: r.conv,
      tasa: r.usos ? r.conv / r.usos : 0,
      monto_medio: r.conv ? r.montoSum / r.conv : 0,
      dias_medio: r.diasN ? r.diasSum / r.diasN : null,
      recompensa_media: r.conv ? r.recompSum / r.conv : 0,
      peso: pesoStatus(status),
    }))
    .sort((a, b) => b.recompensa_media - a.recompensa_media || b.tasa - a.tasa);
}

/** Tras last_touch L, ¿qué siguiente método maximiza valor esperado? */
export function sugerirSiguiente(
  lastStatus: string | null,
  metodos: MetodoStats[],
): string {
  const candidatos = metodos.filter(
    (m) =>
      m.usos_last_touch >= MIN_MUESTRAS_SUGERENCIA &&
      m.status !== "abono" &&
      m.status !== lastStatus,
  );
  if (candidatos.length) {
    const best = [...candidatos].sort((a, b) => {
      const va = (a.tasa * a.monto_medio) / Math.max(a.peso, 0.5);
      const vb = (b.tasa * b.monto_medio) / Math.max(b.peso, 0.5);
      return vb - va;
    })[0]!;
    return best.status;
  }
  for (const s of FALLBACK_SUGERENCIA) {
    if (s !== lastStatus) return s;
  }
  return "contactado";
}

function resumenDe(episodios: Episodio[]): ResumenEfect {
  const cerrados = episodios.filter((e) => e.cerrado);
  const abiertos = episodios.filter((e) => !e.cerrado);
  const dias = cerrados
    .map((e) => e.dias_hasta_pago)
    .filter((d): d is number => d != null);
  const gest = cerrados.map((e) => e.n_gestiones);
  const recaudado = cerrados.reduce((s, e) => s + e.monto_recuperado, 0);
  const recomp = cerrados.map((e) => e.recompensa);
  return {
    recaudado,
    episodios_cerrados: cerrados.length,
    episodios_abiertos: abiertos.length,
    dias_mediana: mediana(dias),
    gestiones_mediana: mediana(gest),
    recompensa_media: recomp.length
      ? recomp.reduce((a, b) => a + b, 0) / recomp.length
      : 0,
  };
}

const SQL_CONTRATO_PLACA = `
SELECT ct.id AS contrato_id
FROM arrendamientos_contrato ct
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND upper(replace(v.placa, ' ', '')) = $1
ORDER BY (ct.estado = 'Activo') DESC, ct.fecha_inicio DESC
LIMIT 1
`;

const SQL_PAGOS_DESDE = `
SELECT
    fecha_registro::text AS fecha,
    valor::numeric AS valor
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
          END AS valor
  FROM terminal_pagos_pagofactura pf
  JOIN terminal_pagos_factura f ON f.id = pf.factura_id
  LEFT JOIN terminal_pagos_canalpago cp ON cp.id = pf.canal_id
  LEFT JOIN terminal_pagos_mediopago mp ON mp.id = cp.medio_id
  LEFT JOIN (
    SELECT factura_id, SUM(valor::numeric) AS valor_multa
    FROM terminal_pagos_pagomulta
    GROUP BY factura_id
  ) pm ON pm.factura_id = f.id
  WHERE f.contrato_id = $1
    AND pf.fecha_pago::date >= $2::date
    AND lower(f.estado) <> 'anulada'
    AND EXISTS (
      SELECT 1 FROM terminal_pagos_itemfactura i
      WHERE i.factura_id = f.id AND i.tipo_item = 'tarifa'
    )
    AND NOT (
      pf.valor::numeric = 25000
      AND lower(COALESCE(mp.nombre, '')) = 'dale'
    )
) x
WHERE valor > 0
ORDER BY fecha_registro
LIMIT 40
`;

const SQL_FICHA_PLACA = `
SELECT
    cl.nombre,
    cl.telefono,
    ct.tarifa::numeric AS valor_cuota,
    upper(replace(v.placa, ' ', '')) AS placa
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE upper(replace(v.placa, ' ', '')) = $1
ORDER BY (ct.estado = 'Activo') DESC, ct.fecha_inicio DESC
LIMIT 1
`;

async function fetchPagosErpDesde(
  placa: string,
  desdeYmd: string,
): Promise<PagoErp[]> {
  const placaNorm = normalizarPlaca(placa);
  for (const url of getDatabaseUrls()) {
    try {
      const contratos = await queryPg<{ contrato_id: string | number }>(
        url,
        SQL_CONTRATO_PLACA,
        [placaNorm],
      );
      const cid = contratos[0]?.contrato_id;
      if (cid == null) continue;
      const rows = await queryPg<{ fecha: string; valor: string | number }>(
        url,
        SQL_PAGOS_DESDE,
        [cid, desdeYmd],
      );
      return rows.map((r) => ({
        fecha: String(r.fecha).slice(0, 10),
        valor: Math.round(Number(r.valor) || 0),
      }));
    } catch (e) {
      console.warn(
        "[efectividad] ERP pagos:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return [];
}

async function fetchFicha(
  placa: string,
): Promise<{ nombre: string; telefono: string } | null> {
  const placaNorm = normalizarPlaca(placa);
  for (const url of getDatabaseUrls()) {
    try {
      const rows = await queryPg<{
        nombre: string | null;
        telefono: string | null;
      }>(url, SQL_FICHA_PLACA, [placaNorm]);
      if (rows[0]) {
        return {
          nombre: rows[0].nombre ?? "",
          telefono: rows[0].telefono ?? "",
        };
      }
    } catch {
      // next
    }
  }
  return null;
}

export async function calcularEfectividad(opts?: {
  placa?: string;
}): Promise<ResultadoEfectividad> {
  const placaFiltro = opts?.placa ? normalizarPlaca(opts.placa) : "";
  const desdeIso = new Date(
    Date.now() - DIAS_VENTANA * 86_400_000,
  ).toISOString();

  let q = supabase
    .from("cartera_gestiones")
    .select("id, placa, perfil_id, status, categoria, notas, monto, created_at")
    .gte("created_at", desdeIso)
    .order("created_at", { ascending: true })
    .limit(8000);

  if (placaFiltro) {
    q = q.eq("placa", placaFiltro);
  }

  const { data, error } = await q;
  type RowGestion = {
    id: unknown;
    placa: unknown;
    perfil_id: unknown;
    status: unknown;
    categoria: unknown;
    notas: unknown;
    monto?: unknown;
    created_at: unknown;
  };
  let rows: RowGestion[] | null = data as RowGestion[] | null;
  if (error && /monto/i.test(error.message)) {
    let q2 = supabase
      .from("cartera_gestiones")
      .select("id, placa, perfil_id, status, categoria, notas, created_at")
      .gte("created_at", desdeIso)
      .order("created_at", { ascending: true })
      .limit(8000);
    if (placaFiltro) q2 = q2.eq("placa", placaFiltro);
    const retry = await q2;
    if (retry.error) throw new Error(retry.error.message);
    rows = (retry.data ?? []).map((r) => ({ ...r, monto: null }));
  } else if (error) {
    throw new Error(error.message);
  }

  const byPlaca = new Map<string, GestionEfect[]>();
  for (const row of rows ?? []) {
    const placa = normalizarPlaca(String(row.placa ?? ""));
    if (!placa) continue;
    const list = byPlaca.get(placa) ?? [];
    list.push({
      id: Number(row.id) || undefined,
      placa,
      perfil_id: String(row.perfil_id ?? ""),
      status: String(row.status ?? ""),
      created_at: String(row.created_at ?? ""),
      notas: row.notas == null ? null : String(row.notas),
      monto:
        row.monto != null && Number.isFinite(Number(row.monto))
          ? Number(row.monto)
          : null,
      categoria: row.categoria == null ? null : String(row.categoria),
    });
    byPlaca.set(placa, list);
  }

  // Prioritize placas with most recent activity
  const placas = [...byPlaca.keys()]
    .sort((a, b) => {
      const la = byPlaca.get(a)!.at(-1)!.created_at;
      const lb = byPlaca.get(b)!.at(-1)!.created_at;
      return lb.localeCompare(la);
    })
    .slice(0, placaFiltro ? 1 : MAX_PLACAS);

  const casosRes = await supabase
    .from("cartera_casos")
    .select("placa, categoria, status, notas")
    .in("placa", placas.length ? placas : ["__none__"]);

  const casoByPlaca = new Map<
    string,
    { categoria: string | null; status: string }
  >();
  for (const c of casosRes.data ?? []) {
    casoByPlaca.set(normalizarPlaca(String(c.placa)), {
      categoria: c.categoria ?? null,
      status: String(c.status ?? ""),
    });
  }

  const todosEpisodios: Episodio[] = [];
  const clientes: ClienteEfect[] = [];

  // Parallel ERP fetches in small batches
  const BATCH = 8;
  for (let b = 0; b < placas.length; b += BATCH) {
    const chunk = placas.slice(b, b + BATCH);
    await Promise.all(
      chunk.map(async (placa) => {
        const gestiones = byPlaca.get(placa) ?? [];
        if (!gestiones.length) return;
        const inicioMin = diaBogota(gestiones[0]!.created_at);
        const erp = await fetchPagosErpDesde(placa, inicioMin);
        const episodios = construirEpisodios(gestiones, erp);
        // Keep latest episode for client card + all for aggregates
        for (const ep of episodios) todosEpisodios.push(ep);
        const ultimo = episodios.at(-1);
        if (!ultimo) return;
        const ficha = await fetchFicha(placa);
        const caso = casoByPlaca.get(placa);
        clientes.push({
          placa,
          nombre: ficha?.nombre ?? "",
          telefono: ficha?.telefono ?? "",
          deuda_total: 0,
          dias_mora: 0,
          categoria: ultimo.categoria ?? caso?.categoria ?? null,
          episodio: ultimo,
        });
      }),
    );
  }

  const metodos = agregarMetodos(todosEpisodios);

  for (const c of clientes) {
    if (!c.episodio.cerrado) {
      c.episodio.sugerencia = sugerirSiguiente(
        c.episodio.last_touch,
        metodos,
      );
    }
  }

  clientes.sort((a, b) => {
    // open first, then by recompensa / deuda
    if (a.episodio.cerrado !== b.episodio.cerrado) {
      return a.episodio.cerrado ? 1 : -1;
    }
    return b.episodio.inicio_at.localeCompare(a.episodio.inicio_at);
  });

  return {
    clientes,
    metodos,
    resumen: resumenDe(todosEpisodios),
    generado_en: new Date().toISOString(),
  };
}

