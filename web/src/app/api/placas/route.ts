import { NextResponse } from "next/server";

import { hasAdminSession } from "@/lib/adminAuth";
import {
  montoMultaPorCiudad,
  registrarMultaPublicacionPlaca,
  type CiudadPublicacion,
} from "@/lib/multaPublicacion";
import { existePlacaActiva } from "@/lib/vehiculoPorPlaca";
import { supabase } from "@/lib/supabase";
import { placaEstaPendiente } from "@/lib/syncPlacaEstado";

export const runtime = "nodejs";

export async function GET() {
  try {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const fechaStr = `${y}-${m}-${d}`;

    const { data, error } = await supabase
      .from("placas")
      .select("*")
      .gte("fecha", fechaStr)
      .lt("fecha", `${fechaStr}T23:59:59`)
      .order("id", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ placas: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al consultar placas";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await hasAdminSession())) {
      return NextResponse.json(
        { error: "Se requiere acceso de administrador" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const placa = (body.placa ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s/g, "");
    const gpsMotoRaw = String(body.gps_moto ?? "").trim().toLowerCase();
    const gps_moto =
      gpsMotoRaw === "ds track" || gpsMotoRaw === "system track"
        ? "ds track"
        : "iop gps";
    const ciudadRaw = String(body.ciudad ?? "").trim().toLowerCase();
    const ciudad: CiudadPublicacion =
      ciudadRaw === "bogota" || ciudadRaw === "bogotá"
        ? "bogota"
        : "bucaramanga";
    const montoMulta = montoMultaPorCiudad(ciudad);
    if (!/^[A-Z0-9]{6}$/.test(placa)) {
      return NextResponse.json(
        { error: "La placa debe tener 6 caracteres alfanuméricos" },
        { status: 400 },
      );
    }

    const existeEnReporte = await existePlacaActiva(placa);
    if (!existeEnReporte) {
      return NextResponse.json(
        { error: "La placa no existe en la base principal de consulta" },
        { status: 400 },
      );
    }

    // La multa siempre se registra, aunque la moto esté pendiente, publicada o recuperada.
    const multa = await registrarMultaPublicacionPlaca(placa, montoMulta);

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const fechaStr = `${y}-${m}-${d}`;

    const { data: existenteHoy, error: existeError } = await supabase
      .from("placas")
      .select("id, status")
      .eq("placa", placa)
      .gte("fecha", fechaStr)
      .lt("fecha", `${fechaStr}T23:59:59`)
      .maybeSingle();
    if (existeError) throw existeError;

    const { pendiente } = await placaEstaPendiente(placa);

    let placaData = existenteHoy
      ? { id: existenteHoy.id, placa, status: existenteHoy.status, gps_moto }
      : null;
    let publicada = false;
    let motivoPublicacion: string | null = null;

    if (existenteHoy) {
      motivoPublicacion = "ya_publicada_hoy";
    } else if (pendiente) {
      motivoPublicacion = "ya_pendiente";
    } else {
      const { data, error } = await supabase
        .from("placas")
        .insert({
          placa,
          status: "pendiente",
          fecha: new Date().toISOString(),
          gps_moto,
        })
        .select()
        .single();

      if (error) throw error;
      placaData = data;
      publicada = true;
    }

    if (!multa.creada && !publicada) {
      return NextResponse.json(
        {
          error:
            "No se pudo registrar la multa en el ERP ni publicar la placa",
          multa: {
            monto: multa.monto,
            creada: false,
            motivo: multa.motivo ?? null,
            ciudad,
          },
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        placa: placaData,
        publicada,
        motivo_publicacion: motivoPublicacion,
        multa: {
          monto: multa.monto,
          creada: multa.creada,
          motivo: multa.motivo ?? null,
          ciudad,
        },
      },
      { status: publicada ? 201 : 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al crear placa";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
