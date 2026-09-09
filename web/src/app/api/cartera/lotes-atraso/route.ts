import { NextResponse } from "next/server";

import {
  cargarListaLoteNicolas,
  crearLoteAtraso38,
} from "@/lib/carteraLotes17";
import { esLoteNicolasPerfil } from "@/lib/carteraLotes17Types";
import {
  esPerfilCarteraId,
  type CarteraPerfilId,
} from "@/lib/carteraPerfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const perfilId = searchParams.get("perfil_id") ?? "";
    if (!esLoteNicolasPerfil(perfilId)) {
      return NextResponse.json(
        { error: "Solo Admin Nicolas usa esta lista de 3–8 días." },
        { status: 400 },
      );
    }

    const payload = await cargarListaLoteNicolas({ autoCrearSiVacio: true });
    return NextResponse.json(payload);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al cargar lote 3–8 días";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      perfil_id?: string;
    };
    if (body.action !== "crear") {
      return NextResponse.json(
        { error: "Acción no válida. Usa action: crear" },
        { status: 400 },
      );
    }

    const perfilId = body.perfil_id ?? "";
    const createdBy: CarteraPerfilId | null = esPerfilCarteraId(perfilId)
      ? perfilId
      : null;

    const { lote, asignadas } = await crearLoteAtraso38({
      createdBy,
      forzar: true,
    });

    const lista = esLoteNicolasPerfil(perfilId)
      ? await cargarListaLoteNicolas({ autoCrearSiVacio: false })
      : null;

    return NextResponse.json({
      ok: true,
      lote,
      asignadas,
      ...(lista ?? {}),
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Error al crear lote 3–8 días";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
