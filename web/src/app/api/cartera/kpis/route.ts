import { NextResponse } from "next/server";

import {
  isoInicioDiaBogota,
  kpisDesdeGestiones,
  PERFILES_KPI,
  type FilaGestionKpi,
} from "@/lib/carteraKpis";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("cartera_gestiones")
      .select("perfil_id, status, placa, created_at, notas, monto")
      .in("perfil_id", [...PERFILES_KPI])
      .gte("created_at", isoInicioDiaBogota())
      .order("created_at", { ascending: false })
      .limit(2000);

    // Si aún no existe columna monto, reintenta sin ella.
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
      placa: String(row.placa ?? "")
        .toUpperCase()
        .replace(/\s/g, ""),
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar KPIs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
