import { clientSedeSp, type SedeSpId } from "@/lib/spSedes";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

const ESTADOS_CREDITO_ACTIVOS = new Set(["entregada", "saldada"]);

export type SedeConsultaSp = Extract<SedeSpId, "bga" | "bogota">;

export type CompraSp = {
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

export type AtrasoSp = {
  monto_adeudado?: number | null;
  dias_atraso?: number | null;
  periodos_pagados?: number | null;
  periodos_debidos?: number | null;
};

export type PagoSpResumen = {
  total_pagado: number;
  ultimo_pago: string;
};

export type CobroSp = {
  id: string;
  fecha: string;
  monto: number;
  tipo?: string;
  referencia?: string;
};

function fechaSolo(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function titleEstado(v: string): string {
  return v
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fechaMs(v: string | null | undefined): number {
  const s = fechaSolo(v);
  if (!s) return 0;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Compra cobrable en calle: crédito entregado/saldado y física activa. */
export function esCompraSpEnCalle(
  estado: string | null | undefined,
  estadoFisico: string | null | undefined,
): boolean {
  const ct = str(estado).toLowerCase();
  const fis = str(estadoFisico).toLowerCase();
  return ESTADOS_CREDITO_ACTIVOS.has(ct) && fis === "activa";
}

/** @deprecated usar esCompraSpEnCalle */
export function esCompraBgaActiva(
  estado: string | null | undefined,
  estadoFisico: string | null | undefined,
): boolean {
  return esCompraSpEnCalle(estado, estadoFisico);
}

export function esCompraSpVigente(
  estado: string | null | undefined,
): boolean {
  return str(estado).toLowerCase() !== "cancelada";
}

export function elegirCompraSp(
  compras: CompraSp[],
  placaNorm: string,
): CompraSp | null {
  const exact = compras.filter(
    (c) => normalizarPlaca(String(c.placa ?? "")) === placaNorm,
  );
  const pref = compras.filter((c) =>
    normalizarPlaca(String(c.placa ?? "")).startsWith(placaNorm),
  );
  const pool = exact.length ? exact : pref;
  if (!pool.length) return null;

  const vigentes = pool.filter((c) => esCompraSpVigente(c.estado));
  const cand = vigentes.length ? vigentes : pool;
  const enCalle = cand.filter((c) =>
    esCompraSpEnCalle(c.estado, c.estado_fisico),
  );
  const final = enCalle.length ? enCalle : cand;
  return [...final].sort(
    (a, b) =>
      fechaMs(b.fecha_entrega || b.seleccionado_at) -
      fechaMs(a.fecha_entrega || a.seleccionado_at),
  )[0];
}

function mapEstadoContratoSp(estado: string | null | undefined): string {
  const e = str(estado).toLowerCase();
  if (e === "entregada" || e === "saldada") return "Activo";
  if (e === "cancelada") return "Inactivo";
  if (!e) return "Activo";
  return titleEstado(e);
}

function mapEstadoVehiculoSp(fisico: string | null | undefined): string {
  const e = str(fisico).toLowerCase();
  if (!e || e === "activa") return "Activo";
  return titleEstado(e);
}

function etiquetaEstadoSp(ct: string, veh: string): string {
  if (ct && ct.toLowerCase() !== "activo") return ct.toUpperCase();
  if (veh && veh.toLowerCase() !== "activo") return veh.toUpperCase();
  return "";
}

export function buildFilaSp(
  sede: SedeConsultaSp,
  compra: CompraSp,
  cliente: { cedula: string; nombre: string; telefono: string },
  atraso: AtrasoSp | null,
  pagos: PagoSpResumen,
): Record<string, string> {
  const valorCuota = Math.round(Number(compra.monto_cuota_periodo ?? 0));
  const deuda = Math.round(Number(atraso?.monto_adeudado ?? 0));
  const diasMora = Math.round(Number(atraso?.dias_atraso ?? 0));
  const pagadasRaw = Number(atraso?.periodos_pagados);
  const generadasRaw = Number(atraso?.periodos_debidos);
  const tienePeriodos =
    Number.isFinite(generadasRaw) && generadasRaw > 0;

  let cuotasGeneradas = "";
  let cuotasPagadas = "";
  let cuotasCompletas = "";
  let cuotasPendientes = "";
  let cumplimiento = "";

  if (tienePeriodos) {
    const pagadas = Number.isFinite(pagadasRaw) ? pagadasRaw : 0;
    cuotasGeneradas = String(generadasRaw);
    cuotasPagadas = pagadas % 1 === 0 ? String(pagadas) : pagadas.toFixed(1);
    cuotasCompletas = String(Math.floor(pagadas));
    cumplimiento = String(Math.round((pagadas / generadasRaw) * 100));
  }
  // ponytail: en SP la mora de calle es dias_atraso, no periodos_debidos - pagados
  cuotasPendientes = String(Math.max(0, diasMora));

  const estadoContrato = mapEstadoContratoSp(compra.estado);
  const estadoVehiculo = mapEstadoVehiculoSp(compra.estado_fisico);
  const etiqueta = etiquetaEstadoSp(estadoContrato, estadoVehiculo);
  const cobrable =
    estadoContrato.toLowerCase() === "activo" &&
    estadoVehiculo.toLowerCase() === "activo";
  const fechaInicio =
    fechaSolo(compra.fecha_entrega) || fechaSolo(compra.seleccionado_at);
  const placaOut = normalizarPlaca(String(compra.placa ?? ""));

  return {
    cedula: cliente.cedula,
    nombre: cliente.nombre,
    placa: placaOut,
    telefono: cliente.telefono,
    visitador: "",
    fecha_inicio: fechaInicio,
    valor_cuota: String(valorCuota),
    cuotas_generadas: cuotasGeneradas,
    cuotas_completas: cuotasCompletas,
    cuotas_pagadas: cuotasPagadas,
    cuotas_pendientes: cuotasPendientes,
    total_pagado: pagos.total_pagado ? String(pagos.total_pagado) : "",
    deuda_cuotas: String(deuda),
    deuda_multas: "0",
    deuda_total: String(deuda),
    ultimo_pago: pagos.ultimo_pago,
    dias_mora: String(diasMora),
    cumplimiento_pct: cumplimiento,
    estado_contrato: estadoContrato,
    estado_vehiculo: estadoVehiculo,
    etiqueta_estado: etiqueta,
    deuda_al_corte: cobrable ? "" : "1",
    fecha_corte: "",
    motivo_estado: etiqueta
      ? estadoContrato.toLowerCase() !== "activo"
        ? `Contrato ${etiqueta}: deuda al corte (no sigue generando mora)`
        : `Vehículo ${etiqueta}: deuda al corte (no sigue generando mora)`
      : "",
    fuente: sede,
    compra_id: compra.id,
    estado_sp: str(compra.estado),
    estado_fisico_sp: str(compra.estado_fisico),
    fecha_sp: fechaInicio,
  };
}

export async function fetchVehiculoPorPlacaSp(
  sede: SedeConsultaSp,
  placa: string,
): Promise<Record<string, string> | null> {
  const placaNorm = normalizarPlaca(placa);
  if (!placaNorm || placaNorm.length < 5) return null;

  try {
    const supabase = clientSedeSp(sede);
    const { data: compras, error: errCompra } = await supabase
      .from("user_moto_compra")
      .select(
        "id, placa, estado, estado_fisico, user_id, monto_cuota_periodo, fecha_entrega, digital_contract_id, seleccionado_at",
      )
      .ilike("placa", `%${placaNorm}%`)
      .order("seleccionado_at", { ascending: false })
      .limit(10);

    if (errCompra) {
      console.warn(`[vehiculoPorPlacaSp] ${sede} compra:`, errCompra.message);
      return null;
    }

    const match = elegirCompraSp((compras as CompraSp[] | null) ?? [], placaNorm);
    if (!match) return null;

    const [atraso, cliente, pagos] = await Promise.all([
      fetchAtrasoSp(supabase, match.id),
      fetchClienteSp(supabase, match, sede),
      fetchPagosResumenSp(supabase, match.id),
    ]);

    return buildFilaSp(sede, match, cliente, atraso, pagos);
  } catch (e) {
    console.warn(
      `[vehiculoPorPlacaSp] ${sede}`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

export async function fetchVehiculoPorPlacaBga(
  placa: string,
): Promise<Record<string, string> | null> {
  return fetchVehiculoPorPlacaSp("bga", placa);
}

export async function fetchCobrosSp(
  sede: SedeConsultaSp,
  compraId: string,
): Promise<CobroSp[]> {
  try {
    const supabase = clientSedeSp(sede);
    const pagos = await fetchPagosConfirmados(supabase, compraId);
    const items: CobroSp[] = [];
    for (const p of pagos) {
      const fecha =
        fechaSolo(p.confirmado_at) || fechaSolo(p.fecha_comprobante);
      if (!fecha) continue;
      const iso = new Date(p.confirmado_at || p.fecha_comprobante || fecha);
      items.push({
        id: str(p.id) || `${fecha}|${p.monto}`,
        fecha: Number.isNaN(iso.getTime()) ? `${fecha}T00:00:00.000Z` : iso.toISOString(),
        monto: Math.round(Number(p.monto) || 0),
        tipo: str(p.contexto_pago) || str(p.medio_pago_admin) || undefined,
        referencia: str(p.referencia) || undefined,
      });
    }
    return items;
  } catch (e) {
    console.warn(
      `[vehiculoPorPlacaSp] cobros ${sede}`,
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}

type PagoRow = {
  id?: string;
  monto?: number | null;
  referencia?: string | null;
  confirmado_at?: string | null;
  fecha_comprobante?: string | null;
  contexto_pago?: string | null;
  medio_pago_admin?: string | null;
  estado?: string | null;
};

type Sb = ReturnType<typeof clientSedeSp>;

async function fetchAtrasoSp(
  supabase: Sb,
  compraId: string,
): Promise<AtrasoSp | null> {
  const full = await supabase
    .from("atrasos")
    .select("monto_adeudado, dias_atraso, periodos_pagados, periodos_debidos")
    .eq("user_moto_compra_id", compraId)
    .maybeSingle();
  if (!full.error) return (full.data as AtrasoSp | null) ?? null;

  const min = await supabase
    .from("atrasos")
    .select("monto_adeudado, dias_atraso")
    .eq("user_moto_compra_id", compraId)
    .maybeSingle();
  if (min.error) {
    console.warn("[vehiculoPorPlacaSp] atraso:", min.error.message);
    return null;
  }
  return (min.data as AtrasoSp | null) ?? null;
}

async function fetchPagosConfirmados(
  supabase: Sb,
  compraId: string,
): Promise<PagoRow[]> {
  const full = await supabase
    .from("pagos")
    .select(
      "id, monto, referencia, confirmado_at, fecha_comprobante, contexto_pago, medio_pago_admin, estado",
    )
    .eq("user_moto_compra_id", compraId)
    .eq("estado", "confirmado")
    .order("confirmado_at", { ascending: false })
    .limit(80);
  if (!full.error) return (full.data as PagoRow[] | null) ?? [];

  const min = await supabase
    .from("pagos")
    .select("id, monto, referencia, confirmado_at, fecha_comprobante")
    .eq("user_moto_compra_id", compraId)
    .order("confirmado_at", { ascending: false })
    .limit(80);
  if (min.error) {
    console.warn("[vehiculoPorPlacaSp] pagos:", min.error.message);
    return [];
  }
  return (min.data as PagoRow[] | null) ?? [];
}

async function fetchPagosResumenSp(
  supabase: Sb,
  compraId: string,
): Promise<PagoSpResumen> {
  const pagos = await fetchPagosConfirmados(supabase, compraId);
  let total = 0;
  let ultimo = "";
  for (const p of pagos) {
    total += Math.round(Number(p.monto) || 0);
    if (!ultimo) {
      ultimo = fechaSolo(p.confirmado_at) || fechaSolo(p.fecha_comprobante);
    }
  }
  return { total_pagado: total, ultimo_pago: ultimo };
}

async function fetchClienteSp(
  supabase: Sb,
  match: CompraSp,
  sede: SedeConsultaSp,
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
        str(hoja.nombre_completo) || str(cd.nombre_contratante) || nombre;
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
      `[vehiculoPorPlacaSp] ${sede} cliente:`,
      e instanceof Error ? e.message : e,
    );
  }

  return {
    cedula,
    nombre: nombre || cedula || (sede === "bogota" ? "Cliente Bogotá" : "Cliente BGA"),
    telefono,
  };
}
