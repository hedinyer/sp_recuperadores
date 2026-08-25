import { NextResponse } from "next/server";

import {
  categoriaMorosoEstable,
  clasificarCategoriaMoroso,
  esCategoriaMoroso,
  type CategoriaMoroso,
} from "@/lib/categoriasMorosos";
import {
  carteraHermesTokenConfigured,
  carteraHermesTokenOk,
} from "@/lib/carteraHermesAuth";
import {
  isoInicioDiaBogota,
  kpisDesdeGestiones,
  notaConMontoPago,
  PERFILES_KPI,
  type FilaGestionKpi,
} from "@/lib/carteraKpis";
import {
  esCarteraStatus,
  esPerfilCarteraId,
  type CarteraStatus,
} from "@/lib/carteraPerfiles";
import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";
import { getDatabaseUrls } from "@/lib/dbUrls";
import { queryPg } from "@/lib/pgPool";
import { supabase } from "@/lib/supabase";
import { fetchVehiculoPorPlaca } from "@/lib/vehiculoPorPlaca";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function misconfigured() {
  return NextResponse.json(
    { error: "Token Hermes cartera no configurado" },
    { status: 503 },
  );
}

function normalizarPlaca(placa: string): string {
  return placa.toUpperCase().replace(/\s/g, "");
}

function parseMonto(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "number"
      ? raw
      : Number(String(raw).replace(/[^\d]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

type MatchRow = {
  placa: string;
  nombre: string;
  telefono: string | null;
  cedula: string;
};

const SQL_BUSCAR_NOMBRE = `
SELECT upper(replace(v.placa, ' ', '')) AS placa,
       cl.nombre, cl.telefono, cl.cedula
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE ct.estado = 'Activo'
  AND ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND cl.nombre ILIKE '%' || $1 || '%'
ORDER BY cl.nombre
LIMIT 8
`;

const SQL_BUSCAR_TEL = `
SELECT upper(replace(v.placa, ' ', '')) AS placa,
       cl.nombre, cl.telefono, cl.cedula
FROM arrendamientos_contrato ct
JOIN clientes_cliente cl ON cl.id = ct.cliente_id
JOIN vehiculos_vehiculo v ON v.id = ct.vehiculo_id
WHERE ct.estado = 'Activo'
  AND ct.fecha_inicio IS NOT NULL
  AND ct.tarifa > 0
  AND regexp_replace(coalesce(cl.telefono, ''), '\\D', '', 'g') LIKE '%' || $1 || '%'
ORDER BY cl.nombre
LIMIT 8
`;

async function buscarPlacasPorQuery(q: string): Promise<string[]> {
  const raw = q.trim();
  if (!raw) return [];

  const placaCand = normalizarPlaca(raw);
  const digits = raw.replace(/\D/g, "");

  // Placa (5+ chars alfanum)
  if (/^[A-Z0-9]{5,8}$/.test(placaCand)) {
    const v = await fetchVehiculoPorPlaca(placaCand);
    if (v?.placa) return [normalizarPlaca(v.placa)];
  }

  const urls = getDatabaseUrls();
  const seen = new Set<string>();
  const placas: string[] = [];

  const sql = digits.length >= 7 ? SQL_BUSCAR_TEL : SQL_BUSCAR_NOMBRE;
  const param = digits.length >= 7 ? digits : raw.slice(0, 40);

  for (const url of urls) {
    try {
      const rows = await queryPg<MatchRow>(url, sql, [param]);
      for (const r of rows) {
        const p = normalizarPlaca(r.placa);
        if (!p || seen.has(p)) continue;
        seen.add(p);
        placas.push(p);
        if (placas.length >= 5) return placas;
      }
    } catch (e) {
      console.warn(
        "[cartera/agent] buscar:",
        e instanceof Error ? e.message : e,
      );
    }
  }
  return placas;
}

async function gestionesDePlaca(placa: string) {
  const withMonto = await supabase
    .from("cartera_gestiones")
    .select("id, placa, perfil_id, status, categoria, notas, monto, created_at")
    .eq("placa", placa)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!withMonto.error) return withMonto.data ?? [];

  const { data, error } = await supabase
    .from("cartera_gestiones")
    .select("id, placa, perfil_id, status, categoria, notas, created_at")
    .eq("placa", placa)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function casoDePlaca(placa: string) {
  const { data } = await supabase
    .from("cartera_casos")
    .select("placa, perfil_id, categoria, status, notas, updated_at")
    .eq("placa", placa)
    .maybeSingle();
  return data ?? null;
}

async function fichaPlaca(placa: string) {
  const [vehiculo, caso, gestiones] = await Promise.all([
    fetchVehiculoPorPlaca(placa),
    casoDePlaca(placa),
    gestionesDePlaca(placa),
  ]);
  if (!vehiculo) return null;
  return {
    placa: normalizarPlaca(vehiculo.placa),
    nombre: vehiculo.nombre ?? "",
    telefono: vehiculo.telefono ?? "",
    cedula: vehiculo.cedula ?? "",
    visitador: vehiculo.visitador ?? "",
    valor_cuota: Number(vehiculo.valor_cuota) || 0,
    deuda_total: Number(vehiculo.deuda_total) || 0,
    dias_mora: Number(vehiculo.dias_mora) || 0,
    cuotas_pendientes: Number(vehiculo.cuotas_pendientes) || 0,
    cumplimiento_pct: Number(vehiculo.cumplimiento_pct) || 0,
    total_pagado: Number(vehiculo.total_pagado) || 0,
    ultimo_pago: vehiculo.ultimo_pago ?? "",
    caso,
    gestiones,
  };
}

async function actionBuscar(q: string) {
  const placas = await buscarPlacasPorQuery(q);
  if (!placas.length) {
    return NextResponse.json({ items: [], q });
  }
  const items = [];
  for (const p of placas) {
    const ficha = await fichaPlaca(p);
    if (ficha) items.push(ficha);
  }
  return NextResponse.json({ items, q, count: items.length });
}

async function actionHistorial(placaRaw: string) {
  const placa = normalizarPlaca(placaRaw);
  if (!placa) {
    return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
  }
  const items = await gestionesDePlaca(placa);
  const caso = await casoDePlaca(placa);
  return NextResponse.json({ placa, caso, items });
}

async function actionPendientes(categoriaRaw: string | null, limitRaw: string | null) {
  const limit = Math.min(20, Math.max(1, Number(limitRaw) || 10));
  const filtro =
    categoriaRaw && esCategoriaMoroso(categoriaRaw)
      ? (categoriaRaw as CategoriaMoroso)
      : null;

  const [{ atrasos }, casosRes] = await Promise.all([
    fetchAtrasosDesdeDb(false),
    supabase.from("cartera_casos").select("placa, perfil_id, categoria, status, notas, updated_at"),
  ]);

  type CasoRow = {
    placa: string;
    perfil_id: string | null;
    categoria: string | null;
    status: string;
    notas: string | null;
    updated_at: string | null;
  };
  const casosByPlaca = new Map<string, CasoRow>();
  for (const row of casosRes.data ?? []) {
    const p = normalizarPlaca(String(row.placa ?? ""));
    if (p) {
      casosByPlaca.set(p, {
        placa: p,
        perfil_id: row.perfil_id ?? null,
        categoria: row.categoria ?? null,
        status: String(row.status ?? "pendiente"),
        notas: row.notas ?? null,
        updated_at: row.updated_at ?? null,
      });
    }
  }

  // ponytail: sin GPS; funcional=true evita inventar bandeja sin_gps
  const items: Array<Record<string, unknown>> = [];
  for (const a of atrasos) {
    if (a.deuda_total <= 0) continue;
    const placa = normalizarPlaca(a.placa);
    const caso = casosByPlaca.get(placa) ?? null;
    const enVivo = clasificarCategoriaMoroso({
      dias_mora: a.dias_mora,
      deuda_total: a.deuda_total,
      total_pagado: a.total_pagado,
      cumplimiento_pct: a.cumplimiento_pct,
      ultimo_pago: a.ultimo_pago,
      gps: { funcional: true },
    });
    const categoria = categoriaMorosoEstable(caso?.categoria, enVivo);
    if (!categoria) continue;
    if (filtro && categoria !== filtro) continue;

    items.push({
      placa,
      nombre: a.nombre,
      telefono: a.telefono,
      deuda_total: a.deuda_total,
      dias_mora: a.dias_mora,
      valor_cuota: a.valor_cuota,
      ultimo_pago: a.ultimo_pago,
      categoria,
      status: caso?.status ?? "pendiente",
      perfil_id: caso?.perfil_id ?? null,
      notas: caso?.notas ?? null,
    });
    if (items.length >= limit) break;
  }

  return NextResponse.json({
    items,
    count: items.length,
    categoria: filtro,
    limit,
  });
}

async function actionKpis() {
  const { data, error } = await supabase
    .from("cartera_gestiones")
    .select("perfil_id, status, placa, created_at, notas, monto")
    .in("perfil_id", [...PERFILES_KPI])
    .gte("created_at", isoInicioDiaBogota())
    .order("created_at", { ascending: false })
    .limit(2000);

  // ponytail: retry sin columna monto si aún no existe en prod
  type RowKpi = {
    perfil_id?: string | null;
    status?: string | null;
    placa?: string | null;
    created_at?: string | null;
    notas?: string | null;
    monto?: number | null;
  };
  let rows: RowKpi[] | null = data as RowKpi[] | null;
  if (error && /monto/i.test(error.message)) {
    const retry = await supabase
      .from("cartera_gestiones")
      .select("perfil_id, status, placa, created_at, notas")
      .in("perfil_id", [...PERFILES_KPI])
      .gte("created_at", isoInicioDiaBogota())
      .order("created_at", { ascending: false })
      .limit(2000);
    if (retry.error) {
      return NextResponse.json({ error: retry.error.message }, { status: 500 });
    }
    rows = retry.data as RowKpi[] | null;
  } else if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filas: FilaGestionKpi[] = (rows ?? []).map((row) => ({
    perfil_id: String(row.perfil_id ?? ""),
    status: String(row.status ?? ""),
    placa: normalizarPlaca(String(row.placa ?? "")),
    created_at: String(row.created_at ?? ""),
    notas: row.notas ?? null,
    monto:
      row.monto != null && Number.isFinite(Number(row.monto))
        ? Number(row.monto)
        : null,
  }));

  const { kpis, recaudado_equipo } = kpisDesdeGestiones(filas);
  return NextResponse.json({
    kpis,
    recaudado_equipo,
    generado_en: new Date().toISOString(),
  });
}

async function actionRegistrar(body: {
  placa?: string;
  perfil_id?: string;
  status?: string;
  notas?: string | null;
  categoria?: string | null;
  monto?: number | string | null;
}) {
  const placa = normalizarPlaca(body.placa ?? "");
  const perfil_id = String(body.perfil_id ?? "").trim();
  const statusRaw = String(body.status ?? "").trim();
  let notas =
    body.notas != null && String(body.notas).trim()
      ? String(body.notas).trim().slice(0, 4000)
      : null;
  const categoria =
    body.categoria != null && String(body.categoria).trim()
      ? String(body.categoria).trim()
      : null;
  const monto = parseMonto(body.monto);

  if (!placa) {
    return NextResponse.json({ error: "Falta la placa" }, { status: 400 });
  }
  if (!esPerfilCarteraId(perfil_id)) {
    return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
  }
  if (!esCarteraStatus(statusRaw)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }
  const status: CarteraStatus = statusRaw;

  if (status === "abono") {
    if (!monto) {
      return NextResponse.json(
        { error: "Escribe el valor del pago" },
        { status: 400 },
      );
    }
    notas = notaConMontoPago(monto, notas);
  }

  const baseRow = { placa, perfil_id, status, categoria, notas };

  let gestion: Record<string, unknown> | null = null;
  let errGestionMsg: string | null = null;

  if (status === "abono" && monto) {
    const withMonto = await supabase
      .from("cartera_gestiones")
      .insert({ ...baseRow, monto })
      .select("id, placa, perfil_id, status, categoria, notas, monto, created_at")
      .single();
    if (!withMonto.error) {
      gestion = withMonto.data;
    } else if (!/monto|schema cache|column/i.test(withMonto.error.message)) {
      errGestionMsg = withMonto.error.message;
    }
  }

  if (!gestion && !errGestionMsg) {
    const { data, error } = await supabase
      .from("cartera_gestiones")
      .insert(baseRow)
      .select("id, placa, perfil_id, status, categoria, notas, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    gestion = data
      ? { ...data, monto: status === "abono" ? monto : null }
      : null;
  } else if (errGestionMsg) {
    return NextResponse.json({ error: errGestionMsg }, { status: 500 });
  }

  const { data: caso, error: errCaso } = await supabase
    .from("cartera_casos")
    .upsert(
      {
        placa,
        perfil_id,
        status,
        categoria,
        notas,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "placa" },
    )
    .select("placa, perfil_id, categoria, status, notas, updated_at")
    .single();

  if (errCaso) {
    return NextResponse.json({ error: errCaso.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, gestion, caso });
}

export async function GET(request: Request) {
  try {
    if (!carteraHermesTokenConfigured()) return misconfigured();
    if (!carteraHermesTokenOk(request)) return unauthorized();

    const { searchParams } = new URL(request.url);
    const action = (searchParams.get("action") ?? "").trim();

    if (action === "buscar") {
      return await actionBuscar(searchParams.get("q") ?? "");
    }
    if (action === "historial") {
      return await actionHistorial(searchParams.get("placa") ?? "");
    }
    if (action === "pendientes") {
      return await actionPendientes(
        searchParams.get("categoria"),
        searchParams.get("limit"),
      );
    }
    if (action === "kpis") {
      return await actionKpis();
    }

    return NextResponse.json(
      {
        error:
          "action inválida. Usa: buscar | historial | pendientes | kpis",
      },
      { status: 400 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error en agent cartera";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!carteraHermesTokenConfigured()) return misconfigured();
    if (!carteraHermesTokenOk(request)) return unauthorized();

    const body = (await request.json()) as {
      action?: string;
      placa?: string;
      perfil_id?: string;
      status?: string;
      notas?: string | null;
      categoria?: string | null;
      monto?: number | string | null;
    };

    const action = String(body.action ?? "registrar").trim();
    if (action !== "registrar") {
      return NextResponse.json(
        { error: "POST solo soporta action=registrar" },
        { status: 400 },
      );
    }

    return await actionRegistrar(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al registrar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
