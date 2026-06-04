import { NextResponse } from "next/server";

import { fetchAtrasosDesdeDb } from "@/lib/atrasosFromDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";
    const { atrasos, resumen } = await fetchAtrasosDesdeDb(refresh);
    return NextResponse.json({ atrasos, resumen });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al generar reporte de atrasos";
    console.error("[api/placas/atrasos]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
