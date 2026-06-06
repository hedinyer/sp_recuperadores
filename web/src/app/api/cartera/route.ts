import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/adminAuth";
import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";
import { calcularMetricasCartera } from "@/lib/carteraMetricas";
import { enriquecerConEstadoGps } from "@/lib/gpsEstadoPlacas";
import { fetchMorososDesdeDb } from "@/lib/morososFromDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json(
        { error: "Se requiere acceso de administrador" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";

    const [{ atrasos, resumen: resumenAtrasos }, { morosos, resumen: resumenMorosos }] =
      await Promise.all([
        fetchAtrasosDesdeDb(refresh),
        fetchMorososDesdeDb(refresh),
      ]);

    const [atrasosConGps, morososConGps] = await Promise.all([
      enriquecerConEstadoGps(atrasos),
      enriquecerConEstadoGps(morosos),
    ]);

    const conGpsAtrasos = atrasosConGps.filter((a) => a.gps.funcional).length;
    const conGpsMorosos = morososConGps.filter((m) => m.gps.funcional).length;

    const metricas = calcularMetricasCartera(
      atrasos,
      morosos,
      conGpsAtrasos,
      conGpsMorosos,
    );

    return NextResponse.json({
      metricas,
      resumen_atrasos: resumenAtrasos,
      resumen_morosos: resumenMorosos,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al calcular métricas de cartera";
    console.error("[api/cartera]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
