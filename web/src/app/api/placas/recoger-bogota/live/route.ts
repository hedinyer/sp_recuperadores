import { NextResponse } from "next/server";

import { posicionesLiveRecogerBogota } from "@/lib/recogerBogota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      placas?: unknown;
    };
    const placas = Array.isArray(body.placas)
      ? body.placas.map((p) => String(p ?? "")).filter(Boolean)
      : [];

    if (!placas.length) {
      return NextResponse.json(
        { error: "Falta el arreglo placas" },
        { status: 400 },
      );
    }

    // El mapa GPS se carga una sola vez; filtrar por placa es barato.
    const data = await posicionesLiveRecogerBogota(placas);
    return NextResponse.json(data);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al actualizar GPS en vivo";
    console.error("[api/placas/recoger-bogota/live]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
