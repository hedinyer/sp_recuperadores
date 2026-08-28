import { NextResponse } from "next/server";

import { posicionesLiveMorosos } from "@/lib/morososGpsLive";

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

    const data = await posicionesLiveMorosos(placas);
    return NextResponse.json(data);
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : "Error al actualizar GPS en vivo";
    console.error("[api/cartera/morosos/live]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
