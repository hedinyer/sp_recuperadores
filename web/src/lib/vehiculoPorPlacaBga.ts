import { clientSedeSp } from "@/lib/spSedes";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

const ESTADOS_CREDITO_ACTIVOS = new Set(["entregada", "saldada"]);

type CompraBga = {
  id: string;
  placa: string | null;
  estado: string | null;
  estado_fisico: string | null;
  user_id: number | null;
  monto_cuota_periodo: number | null;
  fecha_entrega: string | null;
  digital_contract_id: string | null;
  seleccionado_at: string | null;
};

type AtrasoBga = {
  monto_adeudado: number | null;
  dias_atraso: number | null;
};

function fechaSolo(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Compra BGA cobrable en calle: crédito entregado/saldado y física activa. */
export function esCompraBgaActiva(
  estado: string | null | undefined,
  estadoFisico: string | null | undefined,
): boolean {
  const ct = str(estado).toLowerCase();
  const fis = str(estadoFisico).toLowerCase();
  return ESTADOS_CREDITO_ACTIVOS.has(ct) && fis === "activa";
}

/**
 * Consulta deuda/estado de una placa en Supabase BGA.
 * Solo devuelve fila si la compra está activa en calle.
 */
export async function fetchVehiculoPorPlacaBga(
  placa: string,
): Promise<Record<string, string> | null> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm || placaNorm.length < 5) return null;

  try {
    const supabase = clientSedeSp("bga");

    const { data: compras, error: errCompra } = await supabase
      .from("user_moto_compra")
      .select(
        "id, placa, estado, estado_fisico, user_id, monto_cuota_periodo, fecha_entrega, digital_contract_id, seleccionado_at",
      )
      .ilike("placa", `%${placaNorm}%`)
      .neq("estado", "cancelada")
      .order("seleccionado_at", { ascending: false })
      .limit(10);

    if (errCompra) {
      console.warn("[vehiculoPorPlacaBga] compra:", errCompra.message);
      return null;
    }

    const match =
      (compras as CompraBga[] | null)?.find(
        (c) => normalizarPlaca(String(c.placa ?? "")) === placaNorm,
      ) ??
      (compras as CompraBga[] | null)?.find((c) =>
        normalizarPlaca(String(c.placa ?? "")).startsWith(placaNorm),
      );

    if (!match || !esCompraBgaActiva(match.estado, match.estado_fisico)) {
      return null;
    }

    const [{ data: atraso }, cliente] = await Promise.all([
      supabase
        .from("atrasos")
        .select("monto_adeudado, dias_atraso")
        .eq("user_moto_compra_id", match.id)
        .maybeSingle(),
      fetchClienteBga(supabase, match),
    ]);

    const atrasoRow = atraso as AtrasoBga | null;
    const deuda = Math.round(Number(atrasoRow?.monto_adeudado ?? 0));
    const diasMora = Math.round(Number(atrasoRow?.dias_atraso ?? 0));
    const valorCuota = Math.round(Number(match.monto_cuota_periodo ?? 0));
    const placaOut = normalizarPlaca(String(match.placa ?? placaNorm));

    return {
      cedula: cliente.cedula,
      nombre: cliente.nombre,
      placa: placaOut,
      telefono: cliente.telefono,
      visitador: "",
      fecha_inicio: fechaSolo(match.fecha_entrega) || fechaSolo(match.seleccionado_at),
      valor_cuota: String(valorCuota),
      cuotas_generadas: "",
      cuotas_completas: "",
      cuotas_pagadas: "",
      cuotas_pendientes: "",
      total_pagado: "",
      deuda_cuotas: String(deuda),
      deuda_multas: "0",
      deuda_total: String(deuda),
      ultimo_pago: "",
      dias_mora: String(diasMora),
      cumplimiento_pct: "",
      estado_contrato: "Activo",
      estado_vehiculo: "Activo",
      etiqueta_estado: "",
      deuda_al_corte: "",
      fecha_corte: "",
      motivo_estado: "",
      fuente: "bga",
    };
  } catch (e) {
    console.warn(
      "[vehiculoPorPlacaBga]",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

async function fetchClienteBga(
  supabase: ReturnType<typeof clientSedeSp>,
  match: CompraBga,
): Promise<{ cedula: string; nombre: string; telefono: string }> {
  let cedula = "";
  let nombre = "";
  let telefono = "";

  try {
    if (match.user_id != null) {
      const { data: user } = await supabase
        .from("users")
        .select("user")
        .eq("id", match.user_id)
        .maybeSingle();
      cedula = str(user?.user);
    }

    if (match.digital_contract_id) {
      const { data: contrato } = await supabase
        .from("digital_contracts")
        .select("hoja_vida_data, contrato_data")
        .eq("id", match.digital_contract_id)
        .maybeSingle();

      const hoja = (contrato?.hoja_vida_data ?? {}) as Record<string, unknown>;
      const cd = (contrato?.contrato_data ?? {}) as Record<string, unknown>;
      nombre =
        str(hoja.nombre_completo) ||
        str(cd.nombre_contratante) ||
        nombre;
      telefono = str(hoja.celular) || str(cd.celular_contratante) || telefono;
      if (!cedula) {
        cedula =
          str(hoja.numero_identificacion) ||
          str(cd.cedula_contratante) ||
          cedula;
      }
    }
  } catch (e) {
    console.warn(
      "[vehiculoPorPlacaBga] cliente:",
      e instanceof Error ? e.message : e,
    );
  }

  return {
    cedula,
    nombre: nombre || cedula || "Cliente BGA",
    telefono,
  };
}
