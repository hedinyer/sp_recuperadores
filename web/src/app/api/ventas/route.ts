import { NextResponse } from "next/server";

import { getVentasCached, refrescarVentasCache } from "@/lib/ventasCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Público: sin clave. Snapshot con revalidate ~15 min.
 * ?refresh=1 fuerza recarga desde fuentes (botón Actualizar).
 */
export async function GET(request: Request) {
  try {
    const refresh =
      new URL(request.url).searchParams.get("refresh") === "1";
    const payload = refresh
      ? await refrescarVentasCache()
      : await getVentasCached();
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": refresh
          ? "no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar ventas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
