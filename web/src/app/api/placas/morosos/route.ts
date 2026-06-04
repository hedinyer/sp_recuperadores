import { NextResponse } from "next/server";

import { fetchMorososDesdeDb } from "@/lib/morososFromDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";
    const { morosos, resumen } = await fetchMorososDesdeDb(refresh);
    return NextResponse.json({ morosos, resumen });
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al analizar morosos";
    console.error("[api/placas/morosos]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
