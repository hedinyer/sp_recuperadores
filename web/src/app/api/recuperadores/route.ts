import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { filtrarAsignacionesBajaDeuda } from "@/lib/eliminarAsignacionBajaDeuda";
import { supabase } from "@/lib/supabase";
import {
  actualizarStatusPlaca,
  buscarAsignacionPendientePorPlaca,
  esEstadoAsignacionPendiente,
  normalizarPlaca,
} from "@/lib/syncPlacaEstado";

export const runtime = "nodejs";

const COLUMNA_FECHA_ABONO = "fecha_hora_abono";

function esColumnaFaltante(
  error: PostgrestError | null,
  columna: string,
): boolean {
  return (
    error?.code === "PGRST204" &&
    Boolean(error.message?.includes(`'${columna}'`))
  );
}

function sinColumna<T extends Record<string, unknown>>(
  payload: T,
  columna: string,
): T {
  const copia = { ...payload };
  delete copia[columna];
  return copia;
}

async function guardarRecuperador(
  payload: Record<string, unknown>,
  id?: number,
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null }> {
  const ejecutar = (datos: Record<string, unknown>) =>
    id != null
      ? supabase
          .from("recuperadores")
          .update(datos)
          .eq("id", id)
          .select()
          .single()
      : supabase
          .from("recuperadores")
          .insert(datos)
          .select()
          .single();

  let resultado = await ejecutar(payload);
  if (esColumnaFaltante(resultado.error, COLUMNA_FECHA_ABONO)) {
    resultado = await ejecutar(sinColumna(payload, COLUMNA_FECHA_ABONO));
  }

  return resultado;
}

function buildPayload(body: Record<string, unknown>) {
  const nombre_recuperador = String(body.nombre_recuperador ?? "").trim();
  const placa_asignada = normalizarPlaca(String(body.placa_asignada ?? ""));

  const estado_moto = String(body.estado_moto ?? "Abonó").trim() || "Abonó";
  const pagado = Number(body.pagado ?? 0) || 0;
  const multa = Number(body.multa ?? 0) || 0;

  const payload: Record<string, unknown> = {
    nombre_recuperador,
    placa_asignada,
    estado_moto,
    Pagado: pagado,
    multa,
  };

  if (body.tipo_pago != null && String(body.tipo_pago).trim()) {
    payload.tipo_pago = String(body.tipo_pago).trim();
  }
  if (body.presencial != null) {
    payload.presencial = Boolean(body.presencial);
  }
  if (body.foto != null && String(body.foto).trim()) {
    payload.foto = String(body.foto).trim();
  }
  if (body.gps_ubicacion != null && String(body.gps_ubicacion).trim()) {
    payload.gps_ubicacion = String(body.gps_ubicacion).trim();
  }

  const estadoNorm = estado_moto.toLowerCase();
  if (estadoNorm === "recuperada") {
    payload.fecha_hora_recuperada = new Date().toISOString();
    payload.fecha_hora_abono = null;
  }
  if (estadoNorm === "abonó" || estadoNorm === "abono") {
    payload.fecha_hora_abono = new Date().toISOString();
    payload.fecha_hora_recuperada = null;
  }

  return { nombre_recuperador, placa_asignada, estado_moto, payload };
}

function esAccionFinalConsultar(estado_moto: string): boolean {
  const e = estado_moto.trim().toLowerCase();
  return e === "recuperada" || e === "abonó" || e === "abono";
}

/** Un solo registro en consultar: reutiliza asignación pendiente o actualiza la del recuperador. */
async function guardarDesdeConsultar(
  placa_asignada: string,
  nombre_recuperador: string,
  payload: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: PostgrestError | null }> {
  const { data: filas, error: selErr } = await supabase
    .from("recuperadores")
    .select("id, estado_moto, nombre_recuperador, fecha_hora_asignada")
    .eq("placa_asignada", placa_asignada)
    .order("fecha_hora_asignada", { ascending: false });

  if (selErr) throw selErr;

  const pendientes = (filas ?? []).filter((row) =>
    esEstadoAsignacionPendiente(row.estado_moto),
  );

  if (pendientes.length > 0) {
    const principal = pendientes[0];
    const updatePayload = { ...payload };
    delete updatePayload.fecha_hora_asignada;

    const resultado = await guardarRecuperador(updatePayload, principal.id);
    if (resultado.error) return resultado;

    const otrosPendientes = pendientes.slice(1).map((row) => row.id);
    if (otrosPendientes.length > 0) {
      const { error: delErr } = await supabase
        .from("recuperadores")
        .delete()
        .in("id", otrosPendientes);
      if (delErr) throw delErr;
    }

    return resultado;
  }

  const existente = (filas ?? []).find(
    (row) => String(row.nombre_recuperador ?? "").trim() === nombre_recuperador,
  );

  if (existente?.id) {
    const updatePayload = { ...payload };
    delete updatePayload.fecha_hora_asignada;
    return guardarRecuperador(updatePayload, existente.id);
  }

  return guardarRecuperador({
    ...payload,
    fecha_hora_asignada: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nombre_recuperador, placa_asignada, estado_moto, payload } =
      buildPayload(body);

    if (!nombre_recuperador || !placa_asignada) {
      return NextResponse.json(
        { error: "Faltan nombre_recuperador o placa_asignada" },
        { status: 400 },
      );
    }

    const desdeConsultar = Boolean(body.desde_consultar);

    let asignacion;

    if (desdeConsultar && esAccionFinalConsultar(estado_moto)) {
      const { data, error } = await guardarDesdeConsultar(
        placa_asignada,
        nombre_recuperador,
        payload,
      );
      if (error) throw error;
      asignacion = data;
    } else {
      const pendiente = await buscarAsignacionPendientePorPlaca(placa_asignada);

      if (pendiente?.id) {
        const updatePayload = { ...payload };
        delete updatePayload.fecha_hora_asignada;
        const { data, error } = await guardarRecuperador(
          updatePayload,
          pendiente.id,
        );
        if (error) throw error;
        asignacion = data;
      } else {
        const { data: existente } = await supabase
          .from("recuperadores")
          .select("id")
          .eq("placa_asignada", placa_asignada)
          .eq("nombre_recuperador", nombre_recuperador)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existente?.id) {
          const updatePayload = { ...payload };
          if (!updatePayload.fecha_hora_asignada) {
            delete updatePayload.fecha_hora_asignada;
          }
          const { data, error } = await guardarRecuperador(
            updatePayload,
            existente.id,
          );
          if (error) throw error;
          asignacion = data;
        } else {
          const insertPayload = {
            ...payload,
            fecha_hora_asignada: new Date().toISOString(),
          };
          const { data, error } = await guardarRecuperador(insertPayload);
          if (error) throw error;
          asignacion = data;
        }
      }
    }

    await actualizarStatusPlaca(placa_asignada, estado_moto);

    return NextResponse.json({ asignacion }, { status: 201 });
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

    const filas = await filtrarAsignacionesBajaDeuda(data ?? []);

    const gpsPorPlaca = new Map<string, string>();
    for (const row of placasData ?? []) {
      const placa = normalizarPlaca(String(row.placa ?? ""));
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
          fecha_abono: string | null;
          foto: string | null;
          tipo_pago: string | null;
          presencial: boolean | null;
          gps_ubicacion: string | null;
        }>;
      }
    > = {};

    const vistos = new Set<string>();
    for (const row of filas) {
      const nom = row.nombre_recuperador || "Sin nombre";
      const placaNormalizada = normalizarPlaca(row.placa_asignada || "");
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
        gps_moto: gpsPorPlaca.get(placaNormalizada) || "",
        fecha_asignada: row.fecha_hora_asignada,
        fecha_recuperada: row.fecha_hora_recuperada,
        fecha_abono: row.fecha_hora_abono ?? null,
        foto: row.foto ? String(row.foto).trim() || null : null,
        tipo_pago: row.tipo_pago ? String(row.tipo_pago).trim() || null : null,
        presencial:
          row.presencial === true
            ? true
            : row.presencial === false
              ? false
              : null,
        gps_ubicacion: row.gps_ubicacion
          ? String(row.gps_ubicacion).trim() || null
          : null,
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
    const estadoNorm = estado.trim().toLowerCase();
    if (estadoNorm === "recuperada") {
      update.fecha_hora_recuperada = new Date().toISOString();
      update.fecha_hora_abono = null;
    }
    if (estadoNorm === "abonó" || estadoNorm === "abono") {
      update.fecha_hora_abono = new Date().toISOString();
      update.fecha_hora_recuperada = null;
    }
    if (body.gps_ubicacion != null && String(body.gps_ubicacion).trim()) {
      update.gps_ubicacion = String(body.gps_ubicacion).trim();
    }
    if (body.tipo_pago != null && String(body.tipo_pago).trim()) {
      update.tipo_pago = String(body.tipo_pago).trim();
    }
    if (body.presencial != null) {
      update.presencial = Boolean(body.presencial);
    }
    if (body.foto != null && String(body.foto).trim()) {
      update.foto = String(body.foto).trim();
    }

    const { data, error } = await guardarRecuperador(update, Number(id));

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "No se encontró la asignación" },
        { status: 404 },
      );
    }

    const placa = normalizarPlaca(String(data.placa_asignada ?? ""));
    if (placa) {
      await actualizarStatusPlaca(placa, estado);
    }

    return NextResponse.json({ asignacion: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al actualizar";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
