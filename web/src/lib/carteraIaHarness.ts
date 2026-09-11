/**
 * Harness multi-agente de cobro: Extractor → Comportamiento → Scheduler.
 * Usa Hermes Cobrador con JSON estructurado.
 */

import { fetchPagosErpPorPlacas } from "@/lib/reporteFromDb";
import { supabase } from "@/lib/supabase";
import { hermesChatCompletion, parseJsonLoose } from "@/lib/hermesClient";
import {
  IA_INTENTS,
  type AlertaKind,
  type AnalizarResumen,
  type ComportamientoResult,
  type ExtractorResult,
  type IaIntent,
} from "@/lib/carteraIaTypes";
import { obtenerLoteActivoOUltimo } from "@/lib/carteraLotes17";
import type { Lote17PerfilId } from "@/lib/carteraLotes17Types";
import { LOTE_17_PERFILES } from "@/lib/carteraLotes17Types";

const BATCH_LIMIT = 10;
const ALERTA_INMEDIATA_MS = 2 * 60 * 60 * 1000; // 2h

type GestionRow = {
  id: number;
  placa: string;
  perfil_id: string;
  status: string;
  notas: string | null;
  monto: number | null;
  created_at: string;
};

function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

function ymdBogota(ms = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function esLote17PerfilId(id: string): id is Lote17PerfilId {
  return (LOTE_17_PERFILES as readonly string[]).includes(id);
}

function clampConfianza(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, x));
}

function parseMontoPrometido(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function normalizarIntent(raw: unknown): IaIntent {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((IA_INTENTS as readonly string[]).includes(s)) return s as IaIntent;
  if (s.includes("compromiso")) return "compromiso_pago";
  if (s.includes("no_contesta") || s.includes("buzon")) return "no_contesta";
  if (s.includes("excusa")) return "excusa";
  if (s.includes("agres")) return "agresivo";
  if (s.includes("otro") || s.includes("mañana") || s.includes("sabado")) {
    return "pagara_otro_dia";
  }
  return "otro";
}

/** Heurística Colombia: dd/mm/yyyy, “hoy”, “mañana”, “sábado”, “tarde”. */
export function heuristicaFechaCompromiso(
  notas: string | null | undefined,
  createdAt: string,
): string | null {
  const text = String(notas ?? "");
  const base = new Date(createdAt);
  if (Number.isNaN(base.getTime())) return null;

  const bogotaYmd = ymdBogota(base.getTime());
  const [y0, m0, d0] = bogotaYmd.split("-").map(Number);

  const atHour = (y: number, m: number, d: number, h: number, min = 0) => {
    // Construcción UTC-5 fija
    return new Date(
      Date.UTC(y, m - 1, d, h + 5, min, 0),
    ).toISOString();
  };

  const dmY = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmY) {
    const d = Number(dmY[1]);
    const m = Number(dmY[2]);
    const y = Number(dmY[3]);
    const mediodia = /medio\s*d[ií]a|antes del medio/i.test(text);
    const tarde = /tarde|pm|17:|18:|19:/i.test(text);
    const h = mediodia ? 12 : tarde ? 17 : 10;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return atHour(y, m, d, h);
    }
  }

  const lower = text.toLowerCase();
  const tarde = /tarde|en la tarde|pm/.test(lower);
  const h = tarde ? 17 : 10;

  if (/\bhoy\b/.test(lower)) {
    return atHour(y0, m0, d0, h);
  }
  if (/\bma[nñ]ana\b/.test(lower)) {
    const next = new Date(Date.UTC(y0, m0 - 1, d0 + 1, 12, 0, 0));
    return atHour(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      h,
    );
  }
  if (/s[aá]bado/.test(lower)) {
    // Próximo sábado desde la fecha de la gestión (Bogotá)
    const dow = new Date(`${bogotaYmd}T12:00:00-05:00`).getDay(); // 0=dom
    const add = dow === 6 ? 7 : (6 - dow + 7) % 7 || 7;
    const next = new Date(Date.UTC(y0, m0 - 1, d0 + add, 12, 0, 0));
    return atHour(
      next.getUTCFullYear(),
      next.getUTCMonth() + 1,
      next.getUTCDate(),
      10,
    );
  }
  return null;
}

const SYSTEM_EXTRACTOR = `Eres un analista de cobranza en Colombia (zona America/Bogota).
Lees gestiones de cobradores (status + notas) y devuelves SOLO un JSON:
{
  "intent": "compromiso_pago"|"no_contesta"|"excusa"|"agresivo"|"pagara_otro_dia"|"otro",
  "fecha_compromiso_iso": string|null,  // ISO 8601 con offset -05:00 si hay fecha/hora prometida
  "monto_prometido": number|null,       // pesos COP enteros
  "resumen": string,                    // 1 frase corta
  "confianza": number                   // 0..1
}
Reglas de fecha (crítico):
- "hoy" / "hoy en la tarde" → hoy Bogotá; tarde = 17:00-05:00; mañana/medio día = 10:00 o 12:00.
- "mañana" → día siguiente 10:00-05:00 (o 17:00 si dice tarde).
- "sábado" / "el sábado" → próximo sábado 10:00-05:00.
- Fechas dd/mm/yyyy en las notas (ej. 11/09/2026) → ese día.
- Si no hay señal temporal clara → fecha_compromiso_iso null.
- Montos como 550.000 o 550000 → 550000.
No inventes fechas. Responde solo JSON.`;

const SYSTEM_COMPORTAMIENTO = `Eres analista de riesgo de pago en cobranza.
Con historial de gestiones y pagos ERP, responde SOLO JSON:
{
  "cumplio_promesas_previas": true|false|null,
  "riesgo": "bajo"|"medio"|"alto",
  "senal": string
}
Reglas: si hubo compromiso reciente sin pago después → riesgo alto / cumplio false.
Si pagó tras compromiso → cumplio true, riesgo bajo.
Si poco historial → null y riesgo medio.
Solo JSON.`;

async function pasadaExtractor(g: GestionRow): Promise<ExtractorResult> {
  const heuristica = heuristicaFechaCompromiso(g.notas, g.created_at);
  const notas = String(g.notas ?? "").trim();
  // ponytail: si la nota ya trae fecha clara, no gastar Hermes
  const puedeSaltarHermes =
    Boolean(heuristica) &&
    (g.status === "compromiso" ||
      g.status === "no_contesta" ||
      /compromete|compromiso|abono|paga/i.test(notas));

  if (puedeSaltarHermes) {
    return {
      intent:
        g.status === "compromiso" || /compromete|compromiso de pago/i.test(notas)
          ? "compromiso_pago"
          : g.status === "no_contesta"
            ? "no_contesta"
            : "pagara_otro_dia",
      fecha_compromiso_iso: heuristica,
      monto_prometido: (() => {
        const m = notas.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,})/);
        return m ? parseMontoPrometido(m[1]) : null;
      })(),
      resumen: notas.slice(0, 280) || g.status,
      confianza: 0.72,
    };
  }

  try {
    const raw = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_EXTRACTOR },
        {
          role: "user",
          content: JSON.stringify({
            ahora_bogota: new Date().toISOString(),
            gestion: {
              placa: g.placa,
              status: g.status,
              notas: g.notas,
              monto: g.monto,
              created_at: g.created_at,
            },
          }),
        },
      ],
      temperature: 0.1,
      timeoutMs: 60_000,
    });
    const parsed = parseJsonLoose<{
      intent?: string;
      fecha_compromiso_iso?: string | null;
      monto_prometido?: number | null;
      resumen?: string;
      confianza?: number;
    }>(raw);

    let fecha = parsed.fecha_compromiso_iso
      ? String(parsed.fecha_compromiso_iso)
      : null;
    if (fecha) {
      const t = new Date(fecha).getTime();
      if (Number.isNaN(t)) fecha = null;
    }
    if (!fecha) fecha = heuristica;

    return {
      intent:
        g.status === "compromiso"
          ? "compromiso_pago"
          : g.status === "no_contesta"
            ? "no_contesta"
            : normalizarIntent(parsed.intent),
      fecha_compromiso_iso: fecha,
      monto_prometido: parseMontoPrometido(parsed.monto_prometido) ?? null,
      resumen: String(parsed.resumen ?? g.notas ?? g.status).slice(0, 280),
      confianza: clampConfianza(parsed.confianza),
    };
  } catch {
    // Fallback sin Hermes
    const intent: IaIntent =
      g.status === "compromiso"
        ? "compromiso_pago"
        : g.status === "no_contesta"
          ? "no_contesta"
          : "otro";
    return {
      intent,
      fecha_compromiso_iso: heuristica,
      monto_prometido: null,
      resumen: String(g.notas ?? g.status).slice(0, 280),
      confianza: heuristica ? 0.55 : 0.35,
    };
  }
}

async function pasadaComportamiento(
  placa: string,
  gestionesPrevias: GestionRow[],
): Promise<ComportamientoResult> {
  const hoy = ymdBogota();
  const hace30 = ymdBogota(Date.now() - 30 * 86_400_000);
  let pagos: Array<{ fecha: string; monto: number }> = [];
  try {
    pagos = await fetchPagosErpPorPlacas([placa], hace30, hoy);
  } catch {
    pagos = [];
  }

  const huboCompromiso = gestionesPrevias.some(
    (g) => g.status === "compromiso",
  );
  // ponytail: sin compromisos previos no hace falta LLM
  if (!huboCompromiso) {
    return {
      cumplio_promesas_previas: null,
      riesgo: pagos.length ? "bajo" : "medio",
      senal: pagos.length
        ? "Hubo pagos ERP recientes"
        : "Sin compromisos previos ni pagos claros",
    };
  }

  try {
    const raw = await hermesChatCompletion({
      messages: [
        { role: "system", content: SYSTEM_COMPORTAMIENTO },
        {
          role: "user",
          content: JSON.stringify({
            placa,
            gestiones_recientes: gestionesPrevias.slice(0, 12).map((g) => ({
              status: g.status,
              notas: g.notas,
              created_at: g.created_at,
            })),
            pagos_erp_30d: pagos.slice(0, 20),
          }),
        },
      ],
      temperature: 0.1,
      timeoutMs: 60_000,
    });
    const parsed = parseJsonLoose<{
      cumplio_promesas_previas?: boolean | null;
      riesgo?: string;
      senal?: string;
    }>(raw);
    const riesgoRaw = String(parsed.riesgo ?? "medio").toLowerCase();
    const riesgo =
      riesgoRaw === "bajo" || riesgoRaw === "alto" ? riesgoRaw : "medio";
    return {
      cumplio_promesas_previas:
        parsed.cumplio_promesas_previas === true
          ? true
          : parsed.cumplio_promesas_previas === false
            ? false
            : null,
      riesgo,
      senal: String(parsed.senal ?? "").slice(0, 240) || "Sin señal clara",
    };
  } catch {
    const huboCompromiso = gestionesPrevias.some(
      (g) => g.status === "compromiso",
    );
    const huboPago = pagos.length > 0;
    return {
      cumplio_promesas_previas: huboCompromiso ? huboPago : null,
      riesgo: huboCompromiso && !huboPago ? "alto" : "medio",
      senal: huboPago
        ? "Hubo pagos ERP recientes"
        : "Sin pagos ERP en 30 días o sin historial",
    };
  }
}

async function placAsignadasPerfil(
  perfilId: Lote17PerfilId,
): Promise<string[]> {
  const { activo } = await obtenerLoteActivoOUltimo("cuotas_17");
  if (!activo) return [];
  const { data, error } = await supabase
    .from("cartera_lote_placas")
    .select("placa")
    .eq("lote_id", activo.id)
    .eq("perfil_id", perfilId);
  if (error) throw new Error(error.message);
  return [
    ...new Set(
      (data ?? []).map((r) => normalizarPlaca(String(r.placa ?? ""))).filter(Boolean),
    ),
  ];
}

async function gestionesSinAnalizar(
  placas: string[],
  perfilId: string,
  force: boolean,
): Promise<GestionRow[]> {
  if (!placas.length) return [];

  // Trae gestiones recientes del perfil en esas placas
  const { data: gestiones, error } = await supabase
    .from("cartera_gestiones")
    .select("id, placa, perfil_id, status, notas, monto, created_at")
    .eq("perfil_id", perfilId)
    .in("placa", placas)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    // reintento sin monto
    if (/monto/i.test(error.message)) {
      const retry = await supabase
        .from("cartera_gestiones")
        .select("id, placa, perfil_id, status, notas, created_at")
        .eq("perfil_id", perfilId)
        .in("placa", placas)
        .order("created_at", { ascending: false })
        .limit(500);
      if (retry.error) throw new Error(retry.error.message);
      const rows = (retry.data ?? []).map((r) => ({
        id: Number(r.id),
        placa: normalizarPlaca(String(r.placa)),
        perfil_id: String(r.perfil_id),
        status: String(r.status),
        notas: (r.notas as string | null) ?? null,
        monto: null,
        created_at: String(r.created_at),
      }));
      return filtrarSinAnalisis(rows, force);
    }
    throw new Error(error.message);
  }

  const rows: GestionRow[] = (gestiones ?? []).map((r) => ({
    id: Number(r.id),
    placa: normalizarPlaca(String(r.placa)),
    perfil_id: String(r.perfil_id),
    status: String(r.status),
    notas: (r.notas as string | null) ?? null,
    monto:
      r.monto != null && Number.isFinite(Number(r.monto))
        ? Number(r.monto)
        : null,
    created_at: String(r.created_at),
  }));
  return filtrarSinAnalisis(rows, force);
}

async function filtrarSinAnalisis(
  rows: GestionRow[],
  force: boolean,
): Promise<GestionRow[]> {
  if (force) return rows.slice(0, BATCH_LIMIT);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const { data: ya } = await supabase
    .from("cartera_gestion_analisis")
    .select("gestion_id")
    .in("gestion_id", ids);
  const done = new Set((ya ?? []).map((r) => Number(r.gestion_id)));
  return rows.filter((r) => !done.has(r.id)).slice(0, BATCH_LIMIT);
}

async function insertAlerta(opts: {
  perfil_id: string;
  placa: string;
  titulo: string;
  cuerpo: string;
  kind: AlertaKind;
  followup_id?: number | null;
}): Promise<void> {
  const { error } = await supabase.from("cartera_alertas").insert({
    perfil_id: opts.perfil_id,
    placa: opts.placa,
    titulo: opts.titulo,
    cuerpo: opts.cuerpo,
    kind: opts.kind,
    followup_id: opts.followup_id ?? null,
  });
  if (error) {
    console.warn("[carteraIa] alerta:", error.message);
  }
}

async function schedulerEscribe(opts: {
  g: GestionRow;
  extract: ExtractorResult;
  comp: ComportamientoResult;
}): Promise<{ followups: number; alertas: number }> {
  const { g, extract, comp } = opts;
  let followups = 0;
  let alertas = 0;

  const { error: errAnalisis } = await supabase
    .from("cartera_gestion_analisis")
    .upsert(
      {
        gestion_id: g.id,
        placa: g.placa,
        perfil_id: g.perfil_id,
        intent: extract.intent,
        fecha_compromiso: extract.fecha_compromiso_iso,
        monto_prometido: extract.monto_prometido,
        resumen: extract.resumen,
        confianza: extract.confianza,
        analyzed_at: new Date().toISOString(),
        raw_json: { extract, comportamiento: comp },
      },
      { onConflict: "gestion_id" },
    );

  if (errAnalisis) {
    throw new Error(errAnalisis.message);
  }

  const esCompromiso =
    extract.intent === "compromiso_pago" ||
    extract.intent === "pagara_otro_dia" ||
    g.status === "compromiso";

  if (esCompromiso && extract.fecha_compromiso_iso) {
    const dueAt = extract.fecha_compromiso_iso;
    const dueMs = new Date(dueAt).getTime();
    const motivo = extract.resumen.slice(0, 300);

    const { data: fu, error: errFu } = await supabase
      .from("cartera_followups")
      .insert({
        placa: g.placa,
        perfil_id: g.perfil_id,
        gestion_id: g.id,
        due_at: dueAt,
        motivo,
        status: "pendiente",
      })
      .select("id")
      .maybeSingle();

    if (errFu) {
      console.warn("[carteraIa] followup:", errFu.message);
    } else {
      followups = 1;
      const fuId = fu?.id != null ? Number(fu.id) : null;
      const ahora = Date.now();
      if (!Number.isNaN(dueMs) && dueMs <= ahora + ALERTA_INMEDIATA_MS) {
        const kind: AlertaKind =
          dueMs <= ahora ? "compromiso_vencido" : "compromiso_hoy";
        await insertAlerta({
          perfil_id: g.perfil_id,
          placa: g.placa,
          titulo:
            kind === "compromiso_vencido"
              ? `${g.placa}: compromiso vencido`
              : `${g.placa}: compromiso próximo`,
          cuerpo: motivo,
          kind,
          followup_id: fuId,
        });
        alertas += 1;
      }
    }
  }

  if (comp.cumplio_promesas_previas === false && comp.riesgo === "alto") {
    await insertAlerta({
      perfil_id: g.perfil_id,
      placa: g.placa,
      titulo: `${g.placa}: posible ruptura de promesa`,
      cuerpo: comp.senal,
      kind: "rompe_promesa",
    });
    alertas += 1;
  } else if (comp.riesgo === "alto" && extract.intent === "compromiso_pago") {
    await insertAlerta({
      perfil_id: g.perfil_id,
      placa: g.placa,
      titulo: `${g.placa}: prioridad alta`,
      cuerpo: `${extract.resumen} · ${comp.senal}`,
      kind: "prioridad",
    });
    alertas += 1;
  }

  return { followups, alertas };
}

/**
 * Analiza gestiones nuevas del lote 17+ del perfil (Jhon/James).
 */
export async function analizarGestionesPerfil(
  perfilId: string,
  opts: { force?: boolean } = {},
): Promise<AnalizarResumen> {
  if (!esLote17PerfilId(perfilId)) {
    throw new Error("Solo jhon_saenz y james_blanco en el harness v1");
  }

  const resumen: AnalizarResumen = {
    procesadas: 0,
    compromisos: 0,
    followups: 0,
    alertas: 0,
    errores: [],
  };

  const placas = await placAsignadasPerfil(perfilId);
  if (!placas.length) {
    resumen.errores.push("No hay lote activo o placas asignadas");
    return resumen;
  }

  const pendientes = await gestionesSinAnalizar(
    placas,
    perfilId,
    Boolean(opts.force),
  );

  // Historial por placa (para comportamiento)
  const { data: histAll } = await supabase
    .from("cartera_gestiones")
    .select("id, placa, perfil_id, status, notas, created_at")
    .in(
      "placa",
      [...new Set(pendientes.map((p) => p.placa))],
    )
    .order("created_at", { ascending: false })
    .limit(800);

  const histByPlaca = new Map<string, GestionRow[]>();
  for (const r of histAll ?? []) {
    const placa = normalizarPlaca(String(r.placa));
    const list = histByPlaca.get(placa) ?? [];
    list.push({
      id: Number(r.id),
      placa,
      perfil_id: String(r.perfil_id),
      status: String(r.status),
      notas: (r.notas as string | null) ?? null,
      monto: null,
      created_at: String(r.created_at),
    });
    histByPlaca.set(placa, list);
  }

  for (const g of pendientes) {
    try {
      const extract = await pasadaExtractor(g);
      const previas = (histByPlaca.get(g.placa) ?? []).filter(
        (h) => h.id !== g.id,
      );
      const comp = await pasadaComportamiento(g.placa, previas);
      const written = await schedulerEscribe({ g, extract, comp });
      resumen.procesadas += 1;
      if (
        extract.intent === "compromiso_pago" ||
        extract.intent === "pagara_otro_dia" ||
        g.status === "compromiso"
      ) {
        resumen.compromisos += 1;
      }
      resumen.followups += written.followups;
      resumen.alertas += written.alertas;
    } catch (e) {
      resumen.errores.push(
        `${g.placa}#${g.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return resumen;
}

/** Cron: dispara follow-ups vencidos → alertas (o marca cumplido si ya pagó). */
export async function dispararFollowupsVencidos(): Promise<{
  disparados: number;
  cumplidos: number;
  errores: string[];
}> {
  const out = { disparados: 0, cumplidos: 0, errores: [] as string[] };
  const ahora = new Date().toISOString();

  const { data: due, error } = await supabase
    .from("cartera_followups")
    .select("id, placa, perfil_id, due_at, motivo")
    .eq("status", "pendiente")
    .lte("due_at", ahora)
    .order("due_at", { ascending: true })
    .limit(100);

  if (error) {
    out.errores.push(error.message);
    return out;
  }

  const placas = [
    ...new Set(
      (due ?? []).map((f) => normalizarPlaca(String(f.placa))).filter(Boolean),
    ),
  ];
  const hoy = ymdBogota();
  let pagosHoy = new Set<string>();
  if (placas.length) {
    try {
      const pagos = await fetchPagosErpPorPlacas(placas, hoy, hoy);
      pagosHoy = new Set(pagos.map((p) => p.placa));
    } catch (e) {
      out.errores.push(
        `ERP: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  for (const f of due ?? []) {
    const id = Number(f.id);
    const placa = normalizarPlaca(String(f.placa));
    try {
      if (pagosHoy.has(placa)) {
        await supabase
          .from("cartera_followups")
          .update({ status: "cumplido" })
          .eq("id", id);
        out.cumplidos += 1;
        continue;
      }

      await insertAlerta({
        perfil_id: String(f.perfil_id),
        placa,
        titulo: `${placa}: compromiso vencido`,
        cuerpo: String(f.motivo ?? "Seguimiento de compromiso"),
        kind: "compromiso_vencido",
        followup_id: id,
      });
      await supabase
        .from("cartera_followups")
        .update({ status: "disparado" })
        .eq("id", id);
      out.disparados += 1;
    } catch (e) {
      out.errores.push(
        `${placa}#${id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return out;
}

export async function listarAlertasPerfil(
  perfilId: string,
  opts: { soloNoLeidas?: boolean; limit?: number } = {},
) {
  let q = supabase
    .from("cartera_alertas")
    .select(
      "id, perfil_id, placa, titulo, cuerpo, kind, read_at, followup_id, created_at",
    )
    .eq("perfil_id", perfilId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.soloNoLeidas) {
    q = q.is("read_at", null);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function marcarAlertasLeidas(
  perfilId: string,
  ids?: number[],
): Promise<number> {
  let q = supabase
    .from("cartera_alertas")
    .update({ read_at: new Date().toISOString() })
    .eq("perfil_id", perfilId)
    .is("read_at", null);

  if (ids?.length) {
    q = q.in("id", ids);
  }

  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function listarFollowupsProximos(
  perfilId: string,
  horas = 72,
) {
  const hasta = new Date(Date.now() + horas * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("cartera_followups")
    .select("id, placa, perfil_id, due_at, motivo, status, created_at")
    .eq("perfil_id", perfilId)
    .eq("status", "pendiente")
    .lte("due_at", hasta)
    .order("due_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}
