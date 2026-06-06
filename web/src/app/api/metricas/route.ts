import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/adminAuth";
import {
  calcularMetricasRecuperadores,
  parsePeriodoMetrica,
} from "@/lib/metricasRecuperadores";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ok = await hasAdminSession();
    if (!ok) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const periodo = parsePeriodoMetrica(searchParams.get("periodo"));

    const { data, error } = await supabase
      .from("recuperadores")
      .select("*")
      .order("fecha_hora_asignada", { ascending: false });

    if (error) throw error;

    const metricas = calcularMetricasRecuperadores(data ?? [], periodo);

    return NextResponse.json({ periodo, metricas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al calcular métricas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
