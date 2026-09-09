import { NextResponse } from "next/server";

import {
  cargarListaLote17,
  crearLote17,
  esLote17Perfil,
} from "@/lib/carteraLotes17";
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
    if (!esLote17Perfil(perfilId)) {
      return NextResponse.json(
        {
          error:
            "Solo Jhon Sáenz y James Blanco usan esta lista. Elige uno de ellos.",
        },
        { status: 400 },
      );
    }

    const payload = await cargarListaLote17(perfilId, {
      autoCrearSiVacio: true,
    });

    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al cargar lote 17+";
    const missingTable =
      /cartera_lotes_17|cartera_lote_placas|does not exist|schema cache/i.test(
        message,
      );
    return NextResponse.json(
      {
        error: missingTable
          ? "Falta crear las tablas del lote. Ejecuta sql/cartera_lotes_17.sql en Supabase."
          : message,
      },
      { status: 500 },
    );
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

    const { lote, asignadas } = await crearLote17({
      createdBy,
      forzar: true,
    });

    const lista = esLote17Perfil(perfilId)
      ? await cargarListaLote17(perfilId, { autoCrearSiVacio: false })
      : null;

    return NextResponse.json({
      ok: true,
      lote,
      asignadas,
      ...(lista ?? {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al crear lote";
    const missingTable =
      /cartera_lotes_17|cartera_lote_placas|does not exist|schema cache/i.test(
        message,
      );
    return NextResponse.json(
      {
        error: missingTable
          ? "Falta crear las tablas del lote. Ejecuta sql/cartera_lotes_17.sql en Supabase."
          : message,
      },
      { status: 500 },
    );
  }
}
