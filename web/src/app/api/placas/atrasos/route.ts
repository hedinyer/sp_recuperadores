import { NextResponse } from "next/server";

import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";
import { enriquecerConEstadoGps } from "@/lib/gpsEstadoPlacas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";
    const { atrasos, resumen } = await fetchAtrasosDesdeDb(refresh);
    const atrasosConGps = await enriquecerConEstadoGps(atrasos);
    const conGpsFuncional = atrasosConGps.filter((a) => a.gps.funcional).length;
    return NextResponse.json({
      atrasos: atrasosConGps,
      resumen: { ...resumen, con_gps_funcional: conGpsFuncional },
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al generar reporte de atrasos";
    console.error("[api/placas/atrasos]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
