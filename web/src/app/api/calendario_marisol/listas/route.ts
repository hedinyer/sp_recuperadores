import { NextResponse } from "next/server";

import {
  calendarioTokenConfigured,
  calendarioTokenOk,
} from "@/lib/calendarioMarisol";
import {
  addSkylightListItems,
  createSkylightList,
  listSkylightLists,
  resolveSkylightListId,
} from "@/lib/skylightClient";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "No autorizado" }, { status: 401 });
}

function misconfigured() {
  return NextResponse.json(
    { error: "CALENDARIO_MARISOL_TOKEN no configurado" },
    { status: 503 },
  );
}

export async function GET(request: Request) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const listas = await listSkylightLists();
    return NextResponse.json({ listas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al listar listas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!calendarioTokenConfigured()) return misconfigured();
    if (!calendarioTokenOk(request)) return unauthorized();
    const body = await request.json();

    if (Array.isArray(body.items) && body.items.length > 0) {
      const listId = await resolveSkylightListId({
        list_id: body.list_id,
        list_name: body.list_name ?? body.nombre_lista,
        kind: body.kind,
      });
      const items = await addSkylightListItems(listId, body.items);
      return NextResponse.json({ list_id: listId, items }, { status: 201 });
    }

    const lista = await createSkylightList(body);
    return NextResponse.json({ lista }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear lista";
    const status = /requerido|vacío|no encontrada/i.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
