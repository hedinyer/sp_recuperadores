import { NextResponse } from "next/server";

import {
  eliminarAsignacionBajaDeuda,
  parseDeudaTotal,
} from "@/lib/eliminarAsignacionBajaDeuda";
import { fetchVehiculoPorPlaca } from "@/lib/vehiculoPorPlaca";
import { supabase } from "@/lib/supabase";
import {
  buscarAsignacionPendientePorPlaca,
  normalizarPlaca,
} from "@/lib/syncPlacaEstado";
import {
  buscarUbicacionGps,
  gpsMotoDesdeProveedor,
  mensajeGpsNoDisponible,
  resolverProveedorGps,
} from "@/lib/gpsMoto";

export const runtime = "nodejs";

async function obtenerGpsMotoPlaca(placa: string): Promise<string> {
  const placaNorm = normalizarPlaca(placa);
  const { data, error } = await supabase
    .from("placas")
    .select("gps_moto")
    .eq("placa", placaNorm)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[placa] gps_moto:", error.message);
    return "";
  }
  return String(data?.gps_moto ?? "").trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placa = searchParams.get("placa")?.trim();
  if (!placa) {
    return NextResponse.json(
      { error: "Falta el parámetro placa" },
      { status: 400 },
    );
  }

  try {
    const vehiculo = await fetchVehiculoPorPlaca(placa);
    if (!vehiculo) {
      const placaNorm = normalizarPlaca(placa);
      const msg =
        placaNorm.length < 5
          ? "Escribe al menos 5 letras de la placa"
          : "No se encontró la placa";
      return NextResponse.json(
        { error: msg, placa: placa.toUpperCase() },
        { status: 404 },
      );
    }

    const placaCompleta = normalizarPlaca(vehiculo.placa);
    const deudaTotal = parseDeudaTotal(vehiculo.deuda_total);
    const eliminada = await eliminarAsignacionBajaDeuda(
      placaCompleta,
      deudaTotal,
    );
    if (eliminada) {
      return NextResponse.json({
        eliminada: true,
        motivo: "deuda_menor_minimo",
        placa: placaCompleta,
        deuda_total: deudaTotal,
      });
    }

    const gps_motoDb = await obtenerGpsMotoPlaca(placaCompleta);
    const resultadoGps = await buscarUbicacionGps(placaCompleta, gps_motoDb);

    const gps = resultadoGps.ok ? resultadoGps.gps : null;
    const proveedor = gps?.proveedor ?? resolverProveedorGps(gps_motoDb);
    const gps_moto =
      gps_motoDb.trim() ||
      (gps ? gpsMotoDesdeProveedor(gps.proveedor) : gpsMotoDesdeProveedor(proveedor));

    const gps_mensaje = gps
      ? null
      : mensajeGpsNoDisponible(
          placaCompleta,
          resultadoGps.ok ? "sin_dispositivo" : resultadoGps.motivo,
          gps_motoDb,
        );

    const asignacionPendiente =
      await buscarAsignacionPendientePorPlaca(placaCompleta);

    return NextResponse.json({
      vehiculo,
      gps,
      gps_moto,
      gps_proveedor: proveedor,
      gps_mensaje,
      asignacion_pendiente: asignacionPendiente,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo datos";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
