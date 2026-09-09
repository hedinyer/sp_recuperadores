import { NextResponse } from "next/server";

import { cargarMetricasAdmin } from "@/lib/carteraLotes17";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Métricas Jhon + James + Nicolas (sin clave; pensado para Admin Nicolas). */
export async function GET() {
  try {
    const metricas = await cargarMetricasAdmin();
    return NextResponse.json(metricas);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al cargar métricas admin";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
