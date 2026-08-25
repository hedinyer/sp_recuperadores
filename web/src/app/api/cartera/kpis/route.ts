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
      .select("perfil_id, status, placa, created_at")
      .in("perfil_id", [...PERFILES_KPI])
      .gte("created_at", isoInicioDiaBogota())
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const filas: FilaGestionKpi[] = (data ?? []).map((row) => ({
      perfil_id: String(row.perfil_id ?? ""),
      status: String(row.status ?? ""),
      placa: String(row.placa ?? "")
        .toUpperCase()
        .replace(/\s/g, ""),
      created_at: String(row.created_at ?? ""),
    }));

    return NextResponse.json({
      kpis: kpisDesdeGestiones(filas),
      generado_en: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar KPIs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
