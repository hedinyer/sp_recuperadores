import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/adminAuth";
import { enriquecerConEstadoGps } from "@/lib/gpsEstadoPlacas";
import { fetchMorososDesdeDb } from "@/lib/morososFromDb";
import { fetchPlacasPendientes } from "@/lib/placasPendientes";

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
    const [{ morosos, resumen }, pendientes] = await Promise.all([
      fetchMorososDesdeDb(refresh),
      fetchPlacasPendientes(),
    ]);
    const morososConGps = await enriquecerConEstadoGps(morosos);
    const conGpsFuncional = morososConGps.filter((m) => m.gps.funcional).length;
    return NextResponse.json({
      morosos: morososConGps,
      resumen: { ...resumen, con_gps_funcional: conGpsFuncional },
      pendientes,
    });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al analizar morosos";
    console.error("[api/placas/morosos]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
