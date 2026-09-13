import { NextResponse } from "next/server";

import { getVentasCached } from "@/lib/ventasCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Público: sin clave. Sirve el snapshot cacheado (refresco diario 6:00 COT vía cron).
 */
export async function GET() {
  try {
    const payload = await getVentasCached();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar ventas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
