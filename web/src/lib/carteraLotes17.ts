import {
  clasificarCategoriaMoroso,
  categoriaMorosoEstable,
} from "@/lib/categoriasMorosos";
import type {
  CasoCartera,
  GestionCartera,
} from "@/lib/carteraMorososTypes";
import { inicioDiaBogotaMs } from "@/lib/carteraMorososTypes";
import type { CarteraPerfilId } from "@/lib/carteraPerfiles";
import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";
import { normalizarDiasMora } from "@/lib/extractoCliente";
import { ESTADO_GPS_SIN_DISPOSITIVO } from "@/lib/gpsEstadoPlacas";
import { supabase } from "@/lib/supabase";
import {
  calcularEndsAt,
  esLote17Perfil,
  esLoteNicolasPerfil,
  LOTE_17_DIAS,
  LOTE_17_METRICAS_CLAVE,
  LOTE_17_PERFILES,
  LOTE_NICOLAS_PERFIL,
  type Lote17Item,
  type Lote17Metricas,
  type Lote17MetricasPerfil,
  type Lote17Payload,
  type Lote17PerfilId,
  type Lote17PlacaRow,
  type Lote17Row,
  type Lote17Status,
  type LoteMetricasPerfilId,
  type LoteNicolasPerfilId,
  type LoteTipo,
  type MetricasAdminPayload,
} from "@/lib/carteraLotes17Types";
import { montoDesdeGestion } from "@/lib/carteraKpis";
import { nombrePerfilCartera } from "@/lib/carteraPerfiles";

export {
  calcularEndsAt,
  esLote17Perfil,
  esLoteNicolasPerfil,
  LOTE_17_DIAS,
  LOTE_17_METRICAS_CLAVE,
  LOTE_17_PERFILES,
  LOTE_NICOLAS_PERFIL,
  type Lote17Item,
  type Lote17Metricas,
  type Lote17MetricasPerfil,
  type Lote17Payload,
  type Lote17PerfilId,
  type Lote17PlacaRow,
  type Lote17Row,
  type Lote17Status,
  type LoteTipo,
  type MetricasAdminPayload,
};

function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

function inicioAyerBogotaMs(ahora = Date.now()): number {
  return inicioDiaBogotaMs(ahora) - 86_400_000;
}

function finAyerBogotaMs(ahora = Date.now()): number {
  return inicioDiaBogotaMs(ahora) - 1;
}

function etiquetaStatus(status: string): string {
  const map: Record<string, string> = {
    pendiente: "Pendiente",
    contactado: "Contactado",
    compromiso: "Compromiso de pago",
    abono: "Abono",
    no_contesta: "No contesta",
    visita: "Visita",
    en_ruta: "En ruta",
    recuperada: "Recuperada",
    cerrado: "Cerrado",
  };
  return map[status] ?? status;
}

export function formatearTextoGestion(g: GestionCartera | undefined): string | null {
  if (!g) return null;
  const base = etiquetaStatus(g.status);
  const nota = g.notas?.trim();
  return nota ? `${base}: ${nota}` : base;
}

export function splitPlacasEquitativo(
  placas: Array<{
    placa: string;
    nombre: string;
    cedula: string;
    deuda_total: number;
    cuotas_pendientes: number;
  }>,
): Array<{
  placa: string;
  perfil_id: Lote17PerfilId;
  orden: number;
  nombre: string;
  cedula: string;
  deuda_total: number;
  cuotas_pendientes: number;
}> {
  const sorted = [...placas].sort((a, b) => a.placa.localeCompare(b.placa, "es"));
  const mid = Math.ceil(sorted.length / 2);
  return sorted.map((p, i) => ({
    ...p,
    perfil_id: (i < mid ? "jhon_saenz" : "james_blanco") as Lote17PerfilId,
    orden: i,
  }));
}

async function fetchGestionesPorPlacas(
  placas: string[],
): Promise<Map<string, GestionCartera[]>> {
  const map = new Map<string, GestionCartera[]>();
  if (!placas.length) return map;

  const { data, error } = await supabase
    .from("cartera_gestiones")
    .select("id, placa, perfil_id, status, notas, monto, created_at")
    .in("placa", placas)
    .order("created_at", { ascending: false })
    .limit(4000);

  if (error) {
    console.warn("[carteraLotes17] gestiones:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const placa = normalizarPlaca(String(row.placa ?? ""));
    if (!placa) continue;
    const list = map.get(placa) ?? [];
    if (list.length >= 8) continue;
    list.push({
      id: Number(row.id) || undefined,
      placa,
      perfil_id: String(row.perfil_id ?? ""),
      status: String(row.status ?? ""),
      notas: row.notas ?? null,
      created_at: String(row.created_at ?? ""),
      monto:
        row.monto != null && Number.isFinite(Number(row.monto))
          ? Number(row.monto)
          : null,
    });
    map.set(placa, list);
  }
  return map;
}

async function fetchCasosPorPlacas(
  placas: string[],
): Promise<Map<string, CasoCartera>> {
  const map = new Map<string, CasoCartera>();
  if (!placas.length) return map;
  const { data, error } = await supabase
    .from("cartera_casos")
    .select("placa, perfil_id, categoria, status, notas, updated_at")
    .in("placa", placas);
  if (error) {
    console.warn("[carteraLotes17] casos:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const placa = normalizarPlaca(String(row.placa ?? ""));
    if (!placa) continue;
    map.set(placa, {
      placa,
      perfil_id: row.perfil_id ?? null,
      categoria: row.categoria ?? null,
      status: row.status ?? "pendiente",
      notas: row.notas ?? null,
      updated_at: row.updated_at ?? null,
    });
  }
  return map;
}

/** Placas vivas en bandeja 17+ (misma lógica estable que /api/cartera/morosos). */
export async function listarCandidatos17(): Promise<
  Array<{
    placa: string;
    nombre: string;
    cedula: string;
    deuda_total: number;
    cuotas_pendientes: number;
    telefono: string;
    visitador: string;
    fecha_inicio: string;
    valor_cuota: number;
    dias_mora: number;
    cumplimiento_pct: number;
    total_pagado: number;
    ultimo_pago: string;
    pago_hoy: boolean;
    referencia_1: string;
    telefono_ref_1: string;
    referencia_2: string;
    telefono_ref_2: string;
  }>
> {
  const [{ atrasos }, casosRes] = await Promise.all([
    fetchAtrasosDesdeDb(false),
    supabase.from("cartera_casos").select("placa, categoria"),
  ]);

  const casosByPlaca = new Map<string, string | null>();
  for (const row of casosRes.data ?? []) {
    const placa = normalizarPlaca(String(row.placa ?? ""));
    if (placa) casosByPlaca.set(placa, row.categoria ?? null);
  }

  const out: Array<{
    placa: string;
    nombre: string;
    cedula: string;
    deuda_total: number;
    cuotas_pendientes: number;
    telefono: string;
    visitador: string;
    fecha_inicio: string;
    valor_cuota: number;
    dias_mora: number;
    cumplimiento_pct: number;
    total_pagado: number;
    ultimo_pago: string;
    pago_hoy: boolean;
    referencia_1: string;
    telefono_ref_1: string;
    referencia_2: string;
    telefono_ref_2: string;
  }> = [];

  for (const item of atrasos) {
    if (item.deuda_total <= 0) continue;
    const placa = normalizarPlaca(item.placa);
    const itemCat = {
      deuda_total: item.deuda_total,
      cuotas_pendientes: item.cuotas_pendientes,
    };
    const enVivo = clasificarCategoriaMoroso(itemCat);
    const guardada = casosByPlaca.get(placa);
    const categoria = categoriaMorosoEstable(guardada, enVivo, itemCat);
    if (categoria !== "cuotas_17") continue;

    out.push({
      placa,
      nombre: item.nombre,
      cedula: item.cedula,
      deuda_total: item.deuda_total,
      cuotas_pendientes: item.cuotas_pendientes,
      telefono: item.telefono,
      visitador: item.visitador,
      fecha_inicio: item.fecha_inicio,
      valor_cuota: item.valor_cuota,
      dias_mora: normalizarDiasMora(item.dias_mora),
      cumplimiento_pct: item.cumplimiento_pct,
      total_pagado: item.total_pagado,
      ultimo_pago: item.ultimo_pago,
      pago_hoy: item.pago_hoy,
      referencia_1: item.referencia_1 ?? "",
      telefono_ref_1: item.telefono_ref_1 ?? "",
      referencia_2: item.referencia_2 ?? "",
      telefono_ref_2: item.telefono_ref_2 ?? "",
    });
  }

  return out;
}

export async function marcarLoteVencidoSiCorresponde(
  lote: Lote17Row,
): Promise<Lote17Row> {
  if (lote.status !== "activo") return lote;
  if (Date.now() <= new Date(lote.ends_at).getTime()) return lote;

  const { data, error } = await supabase
    .from("cartera_lotes_17")
    .update({ status: "vencido" })
    .eq("id", lote.id)
    .eq("status", "activo")
    .select("id, starts_at, ends_at, status, created_by_perfil_id, created_at")
    .maybeSingle();

  if (error) {
    console.warn("[carteraLotes17] marcar vencido:", error.message);
    return { ...lote, status: "vencido" };
  }
  if (data) {
    return {
      id: Number(data.id),
      starts_at: String(data.starts_at),
      ends_at: String(data.ends_at),
      status: data.status as Lote17Status,
      created_by_perfil_id: data.created_by_perfil_id ?? null,
      created_at: String(data.created_at),
    };
  }
  return { ...lote, status: "vencido" };
}

export async function obtenerLoteActivoOUltimo(
  tipo: LoteTipo = "cuotas_17",
): Promise<{
  activo: Lote17Row | null;
  ultimo: Lote17Row | null;
  totalLotes: number;
}> {
  let q = supabase
    .from("cartera_lotes_17")
    .select(
      "id, starts_at, ends_at, status, created_by_perfil_id, created_at, tipo",
      { count: "exact" },
    )
    .eq("tipo", tipo)
    .order("id", { ascending: false })
    .limit(20);

  let { data, error, count } = await q;

  // Fallback si aún no existe columna tipo (migración pendiente)
  if (error && /tipo/i.test(error.message)) {
    if (tipo !== "cuotas_17") {
      throw new Error(
        "Falta la columna tipo en lotes. Ejecuta sql/cartera_lotes_tipo.sql en Supabase.",
      );
    }
    const retry = await supabase
      .from("cartera_lotes_17")
      .select(
        "id, starts_at, ends_at, status, created_by_perfil_id, created_at",
        { count: "exact" },
      )
      .order("id", { ascending: false })
      .limit(20);
    data = retry.data as typeof data;
    error = retry.error;
    count = retry.count;
  }

  if (error) throw new Error(error.message);

  const rows: Lote17Row[] = (data ?? []).map((r) => ({
    id: Number(r.id),
    starts_at: String(r.starts_at),
    ends_at: String(r.ends_at),
    status: r.status as Lote17Status,
    created_by_perfil_id: r.created_by_perfil_id ?? null,
    created_at: String(r.created_at),
    tipo: (("tipo" in r ? r.tipo : tipo) as LoteTipo) || tipo,
  }));

  let activo = rows.find((r) => r.status === "activo") ?? null;
  if (activo) {
    activo = await marcarLoteVencidoSiCorresponde(activo);
    if (activo.status !== "activo") {
      activo = null;
    }
  }

  return {
    activo,
    ultimo: rows[0] ?? null,
    totalLotes: count ?? rows.length,
  };
}

async function placasEnLoteActivo(tipo: LoteTipo): Promise<Set<string>> {
  const { activo } = await obtenerLoteActivoOUltimo(tipo);
  if (!activo) return new Set();
  const { data } = await supabase
    .from("cartera_lote_placas")
    .select("placa")
    .eq("lote_id", activo.id);
  return new Set(
    (data ?? []).map((r) => normalizarPlaca(String(r.placa ?? ""))).filter(Boolean),
  );
}

/** Candidatos Admin Nicolas: 3–8 días de mora; excluye placas del lote 17+ activo. */
export async function listarCandidatosAtraso38(): Promise<
  Array<{
    placa: string;
    nombre: string;
    cedula: string;
    deuda_total: number;
    cuotas_pendientes: number;
    dias_mora: number;
    telefono: string;
    visitador: string;
    fecha_inicio: string;
    valor_cuota: number;
    cumplimiento_pct: number;
    total_pagado: number;
    ultimo_pago: string;
    pago_hoy: boolean;
    referencia_1: string;
    telefono_ref_1: string;
    referencia_2: string;
    telefono_ref_2: string;
  }>
> {
  const [{ atrasos }, excluidas] = await Promise.all([
    fetchAtrasosDesdeDb(false),
    placasEnLoteActivo("cuotas_17"),
  ]);

  const out: Array<{
    placa: string;
    nombre: string;
    cedula: string;
    deuda_total: number;
    cuotas_pendientes: number;
    dias_mora: number;
    telefono: string;
    visitador: string;
    fecha_inicio: string;
    valor_cuota: number;
    cumplimiento_pct: number;
    total_pagado: number;
    ultimo_pago: string;
    pago_hoy: boolean;
    referencia_1: string;
    telefono_ref_1: string;
    referencia_2: string;
    telefono_ref_2: string;
  }> = [];

  for (const item of atrasos) {
    if (item.deuda_total <= 0) continue;
    const dias = normalizarDiasMora(item.dias_mora);
    if (dias < 3 || dias > 8) continue;
    const placa = normalizarPlaca(item.placa);
    if (!placa || excluidas.has(placa)) continue;
    out.push({
      placa,
      nombre: item.nombre,
      cedula: item.cedula,
      deuda_total: item.deuda_total,
      cuotas_pendientes: item.cuotas_pendientes,
      dias_mora: dias,
      telefono: item.telefono,
      visitador: item.visitador,
      fecha_inicio: item.fecha_inicio,
      valor_cuota: item.valor_cuota,
      cumplimiento_pct: item.cumplimiento_pct,
      total_pagado: item.total_pagado,
      ultimo_pago: item.ultimo_pago,
      pago_hoy: item.pago_hoy,
      referencia_1: item.referencia_1 ?? "",
      telefono_ref_1: item.telefono_ref_1 ?? "",
      referencia_2: item.referencia_2 ?? "",
      telefono_ref_2: item.telefono_ref_2 ?? "",
    });
  }

  return out;
}

export async function crearLote17(opts: {
  createdBy: CarteraPerfilId | null;
  forzar: boolean;
}): Promise<{ lote: Lote17Row; asignadas: number }> {
  const tipo: LoteTipo = "cuotas_17";
  const { activo, totalLotes } = await obtenerLoteActivoOUltimo(tipo);

  if (activo) {
    throw new Error("Ya hay un lote activo. Espera a que venza.");
  }
  if (!opts.forzar && totalLotes > 0) {
    throw new Error(
      "Hay un lote anterior. Usa «Crear nuevo lote» para repartir de nuevo.",
    );
  }

  const closeRes = await supabase
    .from("cartera_lotes_17")
    .update({ status: "cerrado" })
    .eq("status", "vencido")
    .eq("tipo", tipo);
  if (closeRes.error && /tipo/i.test(closeRes.error.message)) {
    await supabase
      .from("cartera_lotes_17")
      .update({ status: "cerrado" })
      .eq("status", "vencido");
  }

  const candidatos = await listarCandidatos17();
  if (!candidatos.length) {
    throw new Error("No hay motos con 17+ cuotas para asignar.");
  }

  const starts = new Date();
  const ends_at = calcularEndsAt(starts);

  const insertPayload: Record<string, unknown> = {
    starts_at: starts.toISOString(),
    ends_at,
    status: "activo",
    created_by_perfil_id: opts.createdBy,
    tipo,
  };

  let { data: loteInsert, error: errLote } = await supabase
    .from("cartera_lotes_17")
    .insert(insertPayload)
    .select("id, starts_at, ends_at, status, created_by_perfil_id, created_at, tipo")
    .single();

  if (errLote && /tipo/i.test(errLote.message)) {
    delete insertPayload.tipo;
    const retry = await supabase
      .from("cartera_lotes_17")
      .insert(insertPayload)
      .select("id, starts_at, ends_at, status, created_by_perfil_id, created_at")
      .single();
    loteInsert = retry.data as typeof loteInsert;
    errLote = retry.error;
  }

  if (errLote || !loteInsert) {
    throw new Error(errLote?.message ?? "No se pudo crear el lote");
  }

  const lote: Lote17Row = {
    id: Number(loteInsert.id),
    starts_at: String(loteInsert.starts_at),
    ends_at: String(loteInsert.ends_at),
    status: loteInsert.status as Lote17Status,
    created_by_perfil_id: loteInsert.created_by_perfil_id ?? null,
    created_at: String(loteInsert.created_at),
    tipo,
  };

  const asignaciones = splitPlacasEquitativo(
    candidatos.map((c) => ({
      placa: c.placa,
      nombre: c.nombre,
      cedula: c.cedula,
      deuda_total: c.deuda_total,
      cuotas_pendientes: c.cuotas_pendientes,
    })),
  );

  for (let i = 0; i < asignaciones.length; i += 100) {
    const chunk = asignaciones.slice(i, i + 100);
    const { error } = await supabase.from("cartera_lote_placas").insert(
      chunk.map((a) => ({
        lote_id: lote.id,
        placa: a.placa,
        perfil_id: a.perfil_id,
        orden: a.orden,
        nombre: a.nombre,
        cedula: a.cedula,
        deuda_total: Math.round(a.deuda_total),
        cuotas_pendientes: a.cuotas_pendientes,
      })),
    );
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < candidatos.length; i += 100) {
    const chunk = candidatos.slice(i, i + 100);
    await supabase.from("cartera_casos").upsert(
      chunk.map((c) => ({
        placa: c.placa,
        categoria: "cuotas_17",
        status: "pendiente",
      })),
      { onConflict: "placa", ignoreDuplicates: true },
    );
  }

  return { lote, asignadas: asignaciones.length };
}

export async function crearLoteAtraso38(opts: {
  createdBy: CarteraPerfilId | null;
  forzar: boolean;
}): Promise<{ lote: Lote17Row; asignadas: number }> {
  const tipo: LoteTipo = "atraso_3_8";
  const { activo, totalLotes } = await obtenerLoteActivoOUltimo(tipo);

  if (activo) {
    throw new Error("Ya hay un lote activo de 3–8 días. Espera a que venza.");
  }
  if (!opts.forzar && totalLotes > 0) {
    throw new Error(
      "Hay un lote anterior. Usa «Crear nuevo lote» para actualizar las placas.",
    );
  }

  await supabase
    .from("cartera_lotes_17")
    .update({ status: "cerrado" })
    .eq("status", "vencido")
    .eq("tipo", tipo);

  const candidatos = await listarCandidatosAtraso38();
  if (!candidatos.length) {
    throw new Error("No hay motos con 3 a 8 días de atraso para asignar.");
  }

  const starts = new Date();
  const ends_at = calcularEndsAt(starts);

  const { data: loteInsert, error: errLote } = await supabase
    .from("cartera_lotes_17")
    .insert({
      starts_at: starts.toISOString(),
      ends_at,
      status: "activo",
      created_by_perfil_id: opts.createdBy,
      tipo,
    })
    .select("id, starts_at, ends_at, status, created_by_perfil_id, created_at, tipo")
    .single();

  if (errLote || !loteInsert) {
    throw new Error(
      errLote?.message?.includes("tipo")
        ? "Falta la columna tipo. Ejecuta sql/cartera_lotes_tipo.sql en Supabase."
        : errLote?.message ?? "No se pudo crear el lote",
    );
  }

  const lote: Lote17Row = {
    id: Number(loteInsert.id),
    starts_at: String(loteInsert.starts_at),
    ends_at: String(loteInsert.ends_at),
    status: loteInsert.status as Lote17Status,
    created_by_perfil_id: loteInsert.created_by_perfil_id ?? null,
    created_at: String(loteInsert.created_at),
    tipo,
  };

  const sorted = [...candidatos].sort((a, b) =>
    a.placa.localeCompare(b.placa, "es"),
  );

  for (let i = 0; i < sorted.length; i += 100) {
    const chunk = sorted.slice(i, i + 100);
    const { error } = await supabase.from("cartera_lote_placas").insert(
      chunk.map((c, j) => ({
        lote_id: lote.id,
        placa: c.placa,
        perfil_id: LOTE_NICOLAS_PERFIL,
        orden: i + j,
        nombre: c.nombre,
        cedula: c.cedula,
        deuda_total: Math.round(c.deuda_total),
        cuotas_pendientes: c.cuotas_pendientes,
        dias_mora: c.dias_mora,
      })),
    );
    if (error) {
      // dias_mora column may be missing
      if (/dias_mora/i.test(error.message)) {
        const retry = await supabase.from("cartera_lote_placas").insert(
          chunk.map((c, j) => ({
            lote_id: lote.id,
            placa: c.placa,
            perfil_id: LOTE_NICOLAS_PERFIL,
            orden: i + j,
            nombre: c.nombre,
            cedula: c.cedula,
            deuda_total: Math.round(c.deuda_total),
            cuotas_pendientes: c.cuotas_pendientes,
          })),
        );
        if (retry.error) throw new Error(retry.error.message);
      } else {
        throw new Error(error.message);
      }
    }
  }

  return { lote, asignadas: sorted.length };
}

function gestionEnRango(
  gestiones: GestionCartera[],
  perfilId: string,
  desdeMs: number,
  hastaMs: number,
): GestionCartera | undefined {
  for (const g of gestiones) {
    if (g.perfil_id !== perfilId) continue;
    const t = new Date(g.created_at).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= desdeMs && t <= hastaMs) return g;
  }
  return undefined;
}

export async function cargarListaLote17(
  perfilId: Lote17PerfilId,
  opts: { autoCrearSiVacio: boolean } = { autoCrearSiVacio: true },
): Promise<Lote17Payload> {
  let { activo, ultimo, totalLotes } = await obtenerLoteActivoOUltimo(
    "cuotas_17",
  );
  let auto_creado = false;

  if (!activo && totalLotes === 0 && opts.autoCrearSiVacio) {
    const created = await crearLote17({
      createdBy: perfilId,
      forzar: false,
    });
    activo = created.lote;
    auto_creado = true;
    totalLotes = 1;
  }

  // Re-leer ultimo si marcamos vencido
  if (!activo) {
    const again = await obtenerLoteActivoOUltimo("cuotas_17");
    activo = again.activo;
    ultimo = again.ultimo;
    totalLotes = again.totalLotes;
  }

  const puede_crear = !activo && totalLotes > 0;

  if (!activo) {
    return {
      lote: ultimo?.status === "vencido" ? ultimo : ultimo,
      items: [],
      puede_crear,
      auto_creado,
      resumen: {
        total: 0,
        por_hacer: 0,
        gestionados_hoy: 0,
        contactados_ayer: 0,
        pagaron_hoy: 0,
      },
    };
  }

  const { data: asignadas, error } = await supabase
    .from("cartera_lote_placas")
    .select(
      "lote_id, placa, perfil_id, orden, nombre, cedula, deuda_total, cuotas_pendientes",
    )
    .eq("lote_id", activo.id)
    .eq("perfil_id", perfilId)
    .order("orden", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (asignadas ?? []) as Lote17PlacaRow[];
  const placas = rows.map((r) => normalizarPlaca(r.placa));

  const [candidatosLive, gestionesByPlaca, casosByPlaca] = await Promise.all([
    listarCandidatos17().catch(() => []),
    fetchGestionesPorPlacas(placas),
    fetchCasosPorPlacas(placas),
  ]);

  // También enriquecer con atrasos generales (pago_hoy aunque salió de 17+)
  const { atrasos } = await fetchAtrasosDesdeDb(false);
  const atrasoByPlaca = new Map(
    atrasos.map((a) => [normalizarPlaca(a.placa), a]),
  );
  const live17ByPlaca = new Map(candidatosLive.map((c) => [c.placa, c]));

  const hoyMs = inicioDiaBogotaMs();
  const ayerDesde = inicioAyerBogotaMs();
  const ayerHasta = finAyerBogotaMs();

  const items: Lote17Item[] = rows.map((row) => {
    const placa = normalizarPlaca(row.placa);
    const live = live17ByPlaca.get(placa);
    const atraso = atrasoByPlaca.get(placa);
    const gestiones = gestionesByPlaca.get(placa) ?? [];
    const caso = casosByPlaca.get(placa) ?? null;
    const ultimoG = gestiones[0];
    const gestionHoy = gestionEnRango(
      gestiones,
      perfilId,
      hoyMs,
      Date.now() + 86_400_000,
    );
    const gestionAyer = gestionEnRango(
      gestiones,
      perfilId,
      ayerDesde,
      ayerHasta,
    );

    const deuda =
      atraso?.deuda_total ??
      live?.deuda_total ??
      (row.deuda_total != null ? Number(row.deuda_total) : 0);
    const cuotas =
      atraso?.cuotas_pendientes ??
      live?.cuotas_pendientes ??
      (row.cuotas_pendientes != null ? Number(row.cuotas_pendientes) : 0);

    return {
      placa,
      cedula: atraso?.cedula ?? live?.cedula ?? row.cedula ?? "",
      nombre: atraso?.nombre ?? live?.nombre ?? row.nombre ?? "",
      telefono: atraso?.telefono ?? live?.telefono ?? "",
      visitador: atraso?.visitador ?? live?.visitador ?? "",
      fecha_inicio: atraso?.fecha_inicio ?? live?.fecha_inicio ?? "",
      valor_cuota: atraso?.valor_cuota ?? live?.valor_cuota ?? 0,
      deuda_total: deuda,
      dias_mora: normalizarDiasMora(
        atraso?.dias_mora ?? live?.dias_mora ?? 0,
      ),
      cuotas_pendientes: cuotas,
      cumplimiento_pct:
        atraso?.cumplimiento_pct ?? live?.cumplimiento_pct ?? 0,
      total_pagado: atraso?.total_pagado ?? live?.total_pagado ?? 0,
      ultimo_pago: atraso?.ultimo_pago ?? live?.ultimo_pago ?? "",
      pago_hoy: Boolean(atraso?.pago_hoy ?? live?.pago_hoy),
      categoria: "cuotas_17",
      gps: ESTADO_GPS_SIN_DISPOSITIVO,
      caso,
      gestiones,
      n_gestiones: gestiones.length,
      referencia_1:
        atraso?.referencia_1 ?? live?.referencia_1 ?? "",
      telefono_ref_1:
        atraso?.telefono_ref_1 ?? live?.telefono_ref_1 ?? "",
      referencia_2:
        atraso?.referencia_2 ?? live?.referencia_2 ?? "",
      telefono_ref_2:
        atraso?.telefono_ref_2 ?? live?.telefono_ref_2 ?? "",
      orden: row.orden,
      gestion_ayer: Boolean(gestionAyer),
      ultima_gestion_texto: formatearTextoGestion(
        gestionAyer ?? gestionHoy ?? ultimoG,
      ),
    };
  });

  const gestionadosHoy = items.filter((m) =>
    Boolean(
      gestionEnRango(m.gestiones, perfilId, hoyMs, Date.now() + 86_400_000),
    ),
  ).length;

  const contactadosAyer = items.filter((m) => m.gestion_ayer).length;
  const pagaronHoy = items.filter(
    (m) =>
      m.pago_hoy ||
      m.gestiones.some(
        (g) =>
          g.perfil_id === perfilId &&
          g.status === "abono" &&
          new Date(g.created_at).getTime() >= hoyMs,
      ),
  ).length;
  const porHacer = items.filter((m) => {
    const hoy = gestionEnRango(
      m.gestiones,
      perfilId,
      hoyMs,
      Date.now() + 86_400_000,
    );
    return !hoy && !m.pago_hoy;
  }).length;

  return {
    lote: activo,
    items,
    puede_crear: false,
    auto_creado,
    resumen: {
      total: items.length,
      por_hacer: porHacer,
      gestionados_hoy: gestionadosHoy,
      contactados_ayer: contactadosAyer,
      pagaron_hoy: pagaronHoy,
    },
  };
}

/**
 * Métricas de comportamiento de la cartera fija del lote activo
 * (Jhon + James): cartera asignada vs abonos registrados en el plazo.
 */
export async function cargarMetricasLote17(): Promise<Lote17Metricas | null> {
  return cargarMetricasLotePorTipo("cuotas_17", [...LOTE_17_PERFILES]);
}

export async function cargarMetricasLotePorTipo(
  tipo: LoteTipo,
  perfilIds: LoteMetricasPerfilId[],
): Promise<Lote17Metricas | null> {
  const { activo } = await obtenerLoteActivoOUltimo(tipo);
  if (!activo) return null;

  const { data: asignadas, error } = await supabase
    .from("cartera_lote_placas")
    .select(
      "lote_id, placa, perfil_id, orden, nombre, cedula, deuda_total, cuotas_pendientes",
    )
    .eq("lote_id", activo.id);

  if (error) throw new Error(error.message);

  const rows = (asignadas ?? []) as Lote17PlacaRow[];
  const placas = [
    ...new Set(rows.map((r) => normalizarPlaca(r.placa)).filter(Boolean)),
  ];

  const { atrasos } = await fetchAtrasosDesdeDb(false);
  const atrasoByPlaca = new Map(
    atrasos.map((a) => [normalizarPlaca(a.placa), a]),
  );

  const gestionesByPlaca = await fetchGestionesPorPlacas(placas);
  const startsMs = new Date(activo.starts_at).getTime();
  const endsMs = Math.min(Date.now(), new Date(activo.ends_at).getTime());
  const hoyMs = inicioDiaBogotaMs();

  let abonosLote: Array<{
    placa: string;
    monto: number;
    created_at: string;
  }> = [];

  if (placas.length) {
    const { data: abonos, error: errAbonos } = await supabase
      .from("cartera_gestiones")
      .select("placa, status, notas, monto, created_at")
      .eq("status", "abono")
      .in("placa", placas)
      .gte("created_at", activo.starts_at)
      .lte("created_at", new Date(endsMs).toISOString())
      .limit(5000);

    if (errAbonos) {
      console.warn("[carteraLotes17] abonos métricas:", errAbonos.message);
      for (const placa of placas) {
        for (const g of gestionesByPlaca.get(placa) ?? []) {
          const t = new Date(g.created_at).getTime();
          if (Number.isNaN(t) || t < startsMs || t > endsMs) continue;
          const monto = montoDesdeGestion(g);
          if (monto > 0) {
            abonosLote.push({ placa, monto, created_at: g.created_at });
          }
        }
      }
    } else {
      abonosLote = (abonos ?? [])
        .map((row) => ({
          placa: normalizarPlaca(String(row.placa ?? "")),
          monto: montoDesdeGestion({
            status: String(row.status ?? "abono"),
            notas: row.notas ?? null,
            monto:
              row.monto != null && Number.isFinite(Number(row.monto))
                ? Number(row.monto)
                : null,
          }),
          created_at: String(row.created_at ?? ""),
        }))
        .filter((a) => a.placa && a.monto > 0);
    }
  }

  const asignacionByPlaca = new Map<string, LoteMetricasPerfilId>();
  for (const row of rows) {
    const placa = normalizarPlaca(row.placa);
    if (perfilIds.includes(row.perfil_id as LoteMetricasPerfilId)) {
      asignacionByPlaca.set(placa, row.perfil_id as LoteMetricasPerfilId);
    }
  }

  const porPerfil = perfilIds.map((id): Lote17MetricasPerfil => {
    const mias = rows.filter((r) => r.perfil_id === id);
    let cartera_total = 0;
    for (const row of mias) {
      const placa = normalizarPlaca(row.placa);
      const live = atrasoByPlaca.get(placa);
      cartera_total +=
        live?.deuda_total ??
        (row.deuda_total != null ? Number(row.deuda_total) : 0);
    }

    const abonosMios = abonosLote.filter(
      (a) => asignacionByPlaca.get(a.placa) === id,
    );
    const recaudado_lote = abonosMios.reduce((s, a) => s + a.monto, 0);
    const recaudado_hoy = abonosMios
      .filter((a) => {
        const t = new Date(a.created_at).getTime();
        return !Number.isNaN(t) && t >= hoyMs;
      })
      .reduce((s, a) => s + a.monto, 0);
    const motos_con_abono_lote = new Set(abonosMios.map((a) => a.placa)).size;
    const pct_recuperado =
      cartera_total > 0
        ? Math.round((recaudado_lote / cartera_total) * 1000) / 10
        : 0;

    return {
      id,
      nombre: nombrePerfilCartera(id),
      n_placas: mias.length,
      cartera_total: Math.round(cartera_total),
      recaudado_lote: Math.round(recaudado_lote),
      recaudado_hoy: Math.round(recaudado_hoy),
      motos_con_abono_lote,
      pct_recuperado,
      etiqueta: tipo === "atraso_3_8" ? "Atraso 3–8 días" : "17+ cuotas",
    };
  });

  const cartera_total = porPerfil.reduce((s, p) => s + p.cartera_total, 0);
  const recaudado_lote = porPerfil.reduce((s, p) => s + p.recaudado_lote, 0);
  const recaudado_hoy = porPerfil.reduce((s, p) => s + p.recaudado_hoy, 0);

  return {
    lote_id: activo.id,
    starts_at: activo.starts_at,
    ends_at: activo.ends_at,
    actualizado_en: new Date().toISOString(),
    equipo: {
      n_placas: rows.length,
      cartera_total,
      recaudado_lote,
      recaudado_hoy,
      pct_recuperado:
        cartera_total > 0
          ? Math.round((recaudado_lote / cartera_total) * 1000) / 10
          : 0,
    },
    por_perfil: porPerfil,
  };
}

function emptyMetricasPerfil(id: LoteMetricasPerfilId, etiqueta: string): Lote17MetricasPerfil {
  return {
    id,
    nombre: nombrePerfilCartera(id),
    n_placas: 0,
    cartera_total: 0,
    recaudado_lote: 0,
    recaudado_hoy: 0,
    motos_con_abono_lote: 0,
    pct_recuperado: 0,
    etiqueta,
  };
}

/** Métricas abiertas para Admin Nicolas: Jhon + James (17+) y él (3–8). */
export async function cargarMetricasAdmin(): Promise<MetricasAdminPayload> {
  const [m17, m38] = await Promise.all([
    cargarMetricasLotePorTipo("cuotas_17", [...LOTE_17_PERFILES]),
    cargarMetricasLotePorTipo("atraso_3_8", [LOTE_NICOLAS_PERFIL]),
  ]);

  const jhon =
    m17?.por_perfil.find((p) => p.id === "jhon_saenz") ??
    emptyMetricasPerfil("jhon_saenz", "17+ cuotas");
  const james =
    m17?.por_perfil.find((p) => p.id === "james_blanco") ??
    emptyMetricasPerfil("james_blanco", "17+ cuotas");
  const nicolas =
    m38?.por_perfil.find((p) => p.id === LOTE_NICOLAS_PERFIL) ??
    emptyMetricasPerfil(LOTE_NICOLAS_PERFIL, "Atraso 3–8 días");

  return {
    actualizado_en: new Date().toISOString(),
    por_perfil: [jhon, james, nicolas],
  };
}

export async function cargarListaLoteNicolas(
  opts: { autoCrearSiVacio: boolean } = { autoCrearSiVacio: true },
): Promise<Lote17Payload> {
  const perfilId: LoteNicolasPerfilId = LOTE_NICOLAS_PERFIL;
  let { activo, ultimo, totalLotes } = await obtenerLoteActivoOUltimo(
    "atraso_3_8",
  );
  let auto_creado = false;

  if (!activo && totalLotes === 0 && opts.autoCrearSiVacio) {
    const created = await crearLoteAtraso38({
      createdBy: perfilId,
      forzar: false,
    });
    activo = created.lote;
    auto_creado = true;
    totalLotes = 1;
  }

  if (!activo) {
    const again = await obtenerLoteActivoOUltimo("atraso_3_8");
    activo = again.activo;
    ultimo = again.ultimo;
    totalLotes = again.totalLotes;
  }

  const puede_crear = !activo && totalLotes > 0;

  if (!activo) {
    return {
      lote: ultimo ?? null,
      items: [],
      puede_crear,
      auto_creado,
      resumen: {
        total: 0,
        por_hacer: 0,
        gestionados_hoy: 0,
        contactados_ayer: 0,
        pagaron_hoy: 0,
      },
    };
  }

  const { data: asignadas, error } = await supabase
    .from("cartera_lote_placas")
    .select(
      "lote_id, placa, perfil_id, orden, nombre, cedula, deuda_total, cuotas_pendientes, dias_mora",
    )
    .eq("lote_id", activo.id)
    .eq("perfil_id", perfilId)
    .order("orden", { ascending: true });

  let rows = (asignadas ?? []) as Lote17PlacaRow[];
  if (error && /dias_mora/i.test(error.message)) {
    const retry = await supabase
      .from("cartera_lote_placas")
      .select(
        "lote_id, placa, perfil_id, orden, nombre, cedula, deuda_total, cuotas_pendientes",
      )
      .eq("lote_id", activo.id)
      .eq("perfil_id", perfilId)
      .order("orden", { ascending: true });
    if (retry.error) throw new Error(retry.error.message);
    rows = (retry.data ?? []) as Lote17PlacaRow[];
  } else if (error) {
    throw new Error(error.message);
  }

  const placas = rows.map((r) => normalizarPlaca(r.placa));
  const [gestionesByPlaca, casosByPlaca, { atrasos }] = await Promise.all([
    fetchGestionesPorPlacas(placas),
    fetchCasosPorPlacas(placas),
    fetchAtrasosDesdeDb(false),
  ]);
  const atrasoByPlaca = new Map(
    atrasos.map((a) => [normalizarPlaca(a.placa), a]),
  );

  const hoyMs = inicioDiaBogotaMs();
  const ayerDesde = inicioAyerBogotaMs();
  const ayerHasta = finAyerBogotaMs();

  const items: Lote17Item[] = rows.map((row) => {
    const placa = normalizarPlaca(row.placa);
    const atraso = atrasoByPlaca.get(placa);
    const gestiones = gestionesByPlaca.get(placa) ?? [];
    const caso = casosByPlaca.get(placa) ?? null;
    const ultimoG = gestiones[0];
    const gestionHoy = gestionEnRango(
      gestiones,
      perfilId,
      hoyMs,
      Date.now() + 86_400_000,
    );
    const gestionAyer = gestionEnRango(
      gestiones,
      perfilId,
      ayerDesde,
      ayerHasta,
    );
    const deuda =
      atraso?.deuda_total ??
      (row.deuda_total != null ? Number(row.deuda_total) : 0);
    const categoria =
      clasificarCategoriaMoroso({
        deuda_total: deuda,
        cuotas_pendientes:
          atraso?.cuotas_pendientes ??
          (row.cuotas_pendientes != null ? Number(row.cuotas_pendientes) : 0),
      }) ?? "cuotas_1_5";

    return {
      placa,
      cedula: atraso?.cedula ?? row.cedula ?? "",
      nombre: atraso?.nombre ?? row.nombre ?? "",
      telefono: atraso?.telefono ?? "",
      visitador: atraso?.visitador ?? "",
      fecha_inicio: atraso?.fecha_inicio ?? "",
      valor_cuota: atraso?.valor_cuota ?? 0,
      deuda_total: deuda,
      dias_mora: normalizarDiasMora(
        atraso?.dias_mora ??
          (row.dias_mora != null ? Number(row.dias_mora) : 0),
      ),
      cuotas_pendientes:
        atraso?.cuotas_pendientes ??
        (row.cuotas_pendientes != null ? Number(row.cuotas_pendientes) : 0),
      cumplimiento_pct: atraso?.cumplimiento_pct ?? 0,
      total_pagado: atraso?.total_pagado ?? 0,
      ultimo_pago: atraso?.ultimo_pago ?? "",
      pago_hoy: Boolean(atraso?.pago_hoy),
      categoria,
      gps: ESTADO_GPS_SIN_DISPOSITIVO,
      caso,
      gestiones,
      n_gestiones: gestiones.length,
      referencia_1: atraso?.referencia_1 ?? "",
      telefono_ref_1: atraso?.telefono_ref_1 ?? "",
      referencia_2: atraso?.referencia_2 ?? "",
      telefono_ref_2: atraso?.telefono_ref_2 ?? "",
      orden: row.orden,
      gestion_ayer: Boolean(gestionAyer),
      ultima_gestion_texto: formatearTextoGestion(
        gestionAyer ?? gestionHoy ?? ultimoG,
      ),
    };
  });

  const gestionadosHoy = items.filter((m) =>
    Boolean(
      gestionEnRango(m.gestiones, perfilId, hoyMs, Date.now() + 86_400_000),
    ),
  ).length;
  const contactadosAyer = items.filter((m) => m.gestion_ayer).length;
  const pagaronHoy = items.filter(
    (m) =>
      m.pago_hoy ||
      m.gestiones.some(
        (g) =>
          g.perfil_id === perfilId &&
          g.status === "abono" &&
          new Date(g.created_at).getTime() >= hoyMs,
      ),
  ).length;
  const porHacer = items.filter((m) => {
    const hoy = gestionEnRango(
      m.gestiones,
      perfilId,
      hoyMs,
      Date.now() + 86_400_000,
    );
    return !hoy && !m.pago_hoy;
  }).length;

  return {
    lote: activo,
    items,
    puede_crear: false,
    auto_creado,
    resumen: {
      total: items.length,
      por_hacer: porHacer,
      gestionados_hoy: gestionadosHoy,
      contactados_ayer: contactadosAyer,
      pagaron_hoy: pagaronHoy,
    },
  };
}

