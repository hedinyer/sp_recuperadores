import { NextResponse } from "next/server";

import { cargarMetricasLote17 } from "@/lib/carteraLotes17";
import { LOTE_17_METRICAS_CLAVE } from "@/lib/carteraLotes17Types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clave = String(searchParams.get("clave") ?? "").trim();
    if (clave !== LOTE_17_METRICAS_CLAVE) {
      return NextResponse.json(
        { error: "Clave incorrecta" },
        { status: 401 },
      );
    }

    const metricas = await cargarMetricasLote17();
    if (!metricas) {
      return NextResponse.json(
        { error: "No hay un lote activo para medir" },
        { status: 404 },
      );
    }

    return NextResponse.json(metricas);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al cargar métricas del lote";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
