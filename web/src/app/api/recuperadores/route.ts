import { NextResponse } from "next/server";

import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("recuperadores")
      .select("*")
      .order("fecha_hora_asignada", { ascending: false });

    if (error) throw error;

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
          fecha_asignada: string | null;
          fecha_recuperada: string | null;
        }>;
      }
    > = {};

    for (const row of data) {
      const nom = row.nombre_recuperador || "Sin nombre";
      if (!agrupado[nom]) {
        agrupado[nom] = { nombre: nom, asignaciones: [] };
      }
      agrupado[nom].asignaciones.push({
        id: row.id,
        placa: (row.placa_asignada || "").toUpperCase().replace(/\s/g, ""),
        estado: row.estado_moto || "pendiente",
        pagado: Number(row.Pagado) || 0,
        multa: Number(row.multa) || 0,
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
