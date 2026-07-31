import { NextResponse } from "next/server";

import { listarMotosRecogerBogota } from "@/lib/recogerBogota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get("refresh") === "1";
    const data = await listarMotosRecogerBogota(refresh);
    return NextResponse.json(data);
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Error al generar lista Recoger Bogotá";
    console.error("[api/placas/recoger-bogota]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
