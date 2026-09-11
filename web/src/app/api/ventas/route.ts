import { NextResponse } from "next/server";

import { cargarMetricasVentas } from "@/lib/ventasMetricas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Solo lectura: agrega ventas de BGA, Girardot, Bogotá y railweb. */
export async function GET() {
  try {
    const payload = await cargarMetricasVentas();
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar ventas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
