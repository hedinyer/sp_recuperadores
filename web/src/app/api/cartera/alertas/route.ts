import { NextResponse } from "next/server";

import {
  listarAlertasPerfil,
  marcarAlertasLeidas,
} from "@/lib/carteraIaHarness";
import { esPerfilCarteraId } from "@/lib/carteraPerfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const perfilId = String(searchParams.get("perfil_id") ?? "").trim();
    const unread = searchParams.get("unread") === "1";
    if (!esPerfilCarteraId(perfilId)) {
      return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
    }

    const items = await listarAlertasPerfil(perfilId, {
      soloNoLeidas: unread,
      limit: 50,
    });
    const noLeidas = items.filter((a) => !a.read_at).length;

    return NextResponse.json({
      items,
      no_leidas: unread ? items.length : noLeidas,
      generado_en: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar alertas";
    if (/relation .* does not exist|schema cache/i.test(msg)) {
      return NextResponse.json(
        {
          items: [],
          no_leidas: 0,
          error:
            "Faltan tablas IA. Aplica web/sql/cartera_ia_cobro.sql en Supabase.",
        },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      perfil_id?: string;
      ids?: number[];
    };
    const perfilId = String(body.perfil_id ?? "").trim();
    if (!esPerfilCarteraId(perfilId)) {
      return NextResponse.json({ error: "Perfil inválido" }, { status: 400 });
    }
    const ids = Array.isArray(body.ids)
      ? body.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : undefined;
    const n = await marcarAlertasLeidas(perfilId, ids);
    return NextResponse.json({ ok: true, marcadas: n });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al marcar alertas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
