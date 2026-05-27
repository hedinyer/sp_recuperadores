import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nombre_recuperador = String(body.nombre_recuperador ?? "").trim();
    const placa_asignada = String(body.placa_asignada ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");

    if (!nombre_recuperador || !placa_asignada) {
      return NextResponse.json(
        { error: "Faltan nombre_recuperador o placa_asignada" },
        { status: 400 },
      );
    }

    const estado_moto = String(body.estado_moto ?? "Abonó").trim() || "Abonó";
    const pagado = Number(body.pagado ?? 0) || 0;
    const multa = Number(body.multa ?? 0) || 0;

    const payload: Record<string, unknown> = {
      nombre_recuperador,
      placa_asignada,
      estado_moto,
      Pagado: pagado,
      multa,
      fecha_hora_asignada: new Date().toISOString(),
    };

    if (estado_moto === "recuperada") {
      payload.fecha_hora_recuperada = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("recuperadores")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ asignacion: data }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear registro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const [{ data, error }, { data: placasData, error: placasError }] =
      await Promise.all([
        supabase
          .from("recuperadores")
          .select("*")
          .order("fecha_hora_asignada", { ascending: false }),
        supabase.from("placas").select("placa, gps_moto"),
      ]);

    if (error) throw error;
    if (placasError) throw placasError;

    const gpsPorPlaca = new Map<string, string>();
    for (const row of placasData ?? []) {
      const placa = String(row.placa ?? "").toUpperCase().replace(/\s/g, "");
      if (!placa) continue;
      gpsPorPlaca.set(placa, String(row.gps_moto ?? "").trim());
    }

    const agrupado: Record<
      string,
      {
        nombre: string;
        asignaciones: Array<{
          id: number;
          placa: string;
          estado: string;
          pagado: number;
          multa: number;
          gps_moto: string;
          fecha_asignada: string | null;
          fecha_recuperada: string | null;
        }>;
      }
    > = {};

    const vistos = new Set<string>();
    for (const row of data) {
      const nom = row.nombre_recuperador || "Sin nombre";
      const placaNormalizada = (row.placa_asignada || "")
        .toUpperCase()
        .replace(/\s/g, "");
      const dedupeKey = `${nom}::${placaNormalizada}`;
      if (vistos.has(dedupeKey)) continue;
      vistos.add(dedupeKey);

      if (!agrupado[nom]) {
        agrupado[nom] = { nombre: nom, asignaciones: [] };
      }
      agrupado[nom].asignaciones.push({
        id: row.id,
        placa: placaNormalizada,
        estado: row.estado_moto || "pendiente",
        pagado: Number(row.Pagado) || 0,
        multa: Number(row.multa) || 0,
        gps_moto:
          gpsPorPlaca.get(placaNormalizada) || "",
        fecha_asignada: row.fecha_hora_asignada,
        fecha_recuperada: row.fecha_hora_recuperada,
      });
    }

    const recuperadores = Object.values(agrupado);

    return NextResponse.json({ recuperadores });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al consultar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    }

    const estado = (body.estado_moto as string) || "recuperada";
    const update: Record<string, unknown> = {
      estado_moto: estado,
      Pagado: body.pagado ?? 0,
      multa: body.multa ?? 0,
    };
    if (body.nombre_recuperador) {
      update.nombre_recuperador = String(body.nombre_recuperador).trim();
    }
    if (estado === "recuperada") {
      update.fecha_hora_recuperada = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("recuperadores")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "No se encontró la asignación" },
        { status: 404 },
      );
    }

    return NextResponse.json({ asignacion: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
