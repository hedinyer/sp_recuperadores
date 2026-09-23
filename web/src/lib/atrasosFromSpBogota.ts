import { analizarPatronPago, type PatronPago } from "@/lib/analisisMorosidad";
import { clientSedeSp } from "@/lib/spSedes";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

const PATRON_VACIO: PatronPago = analizarPatronPago([]);
const DIAS_RECOGER_BANDEJA = 4;

export type AtrasoPinilla = {
  placa: string;
  cedula: string;
  nombre: string;
  telefono: string;
  valor_cuota: number;
  deuda_total: number;
  cuotas_pendientes: number;
  pago_hoy: false;
  origen: "pinilla";
} & PatronPago;

type HojaVida = {
  nombre_completo?: unknown;
  celular?: unknown;
};

type ContractRow = {
  hoja_vida_data?: HojaVida | null;
  created_at?: string | null;
};

type UserRow = {
  id?: number;
  user?: string | null;
  digital_contracts?: ContractRow | ContractRow[] | null;
};

type CompraRow = {
  id?: string;
  placa?: string | null;
  monto_cuota_periodo?: number | null;
  user_id?: number | null;
};

export type FilaMotosParaRecoger = {
  dias_atraso?: number | null;
  monto_adeudado?: number | null;
  user_id?: number | null;
  periodos_pagados?: number | null;
  periodos_debidos?: number | null;
  user_moto_compra?: CompraRow | CompraRow[] | null;
  users?: UserRow | UserRow[] | null;
};

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function contactoDesdeUsers(users: UserRow | UserRow[] | null | undefined): {
  nombre: string;
  telefono: string;
  cedula: string;
} {
  const u = uno(users);
  const cedula = String(u?.user ?? "").trim();
  const raw = u?.digital_contracts;
  const contracts = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const latest = [...contracts].sort(
    (a, b) =>
      new Date(b.created_at ?? 0).getTime() -
      new Date(a.created_at ?? 0).getTime(),
  )[0];
  const hoja = latest?.hoja_vida_data ?? {};
  return {
    nombre: String(hoja.nombre_completo ?? "").trim(),
    telefono: String(hoja.celular ?? "").trim(),
    cedula,
  };
}

/** Fila Pinilla → atraso de Recoger. Null si no hay placa o deuda. */
export function mapearFilaPinilla(
  row: FilaMotosParaRecoger,
): AtrasoPinilla | null {
  const compra = uno(row.user_moto_compra);
  const placa = normalizarPlaca(compra?.placa ?? "");
  const deuda = Math.round(Number(row.monto_adeudado) || 0);
  if (!placa || deuda <= 0) return null;

  const pagadas = Number(row.periodos_pagados) || 0;
  const generadas = Number(row.periodos_debidos) || 0;
  const pendientes =
    generadas > 0
      ? Math.max(0, generadas - pagadas)
      : Math.max(0, Number(row.dias_atraso) || 0);

  const { nombre, telefono, cedula } = contactoDesdeUsers(row.users);

  return {
    placa,
    cedula,
    nombre,
    telefono,
    valor_cuota: Math.round(Number(compra?.monto_cuota_periodo) || 0),
    deuda_total: deuda,
    cuotas_pendientes: pendientes,
    pago_hoy: false,
    origen: "pinilla",
    ...PATRON_VACIO,
  };
}

const SELECT_RECOGER =
  "dias_atraso, monto_adeudado, user_id, user_moto_compra(placa, monto_cuota_periodo), users(user, digital_contracts(hoja_vida_data, created_at))";

async function fetchDesdeMotosParaRecoger(): Promise<AtrasoPinilla[]> {
  const { data, error } = await clientSedeSp("bogota")
    .from("motos_para_recoger")
    .select(SELECT_RECOGER)
    .eq("estado", "pendiente");

  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => mapearFilaPinilla(row as FilaMotosParaRecoger))
    .filter((a): a is AtrasoPinilla => a != null);
}

type AtrasoVistaRow = {
  user_moto_compra_id: string;
  user_id?: number | null;
  monto_adeudado: number | null;
  dias_atraso: number | null;
  periodos_pagados: number | null;
  periodos_debidos: number | null;
};

/** ponytail: si RLS tapa motos_para_recoger, atrasos ≥ 4 días es la misma bandeja. */
async function fetchDesdeAtrasosBandeja(): Promise<AtrasoPinilla[]> {
  const sb = clientSedeSp("bogota");
  const { data: atrasos, error: errAtrasos } = await sb
    .from("atrasos")
    .select(
      "user_moto_compra_id, user_id, monto_adeudado, dias_atraso, periodos_pagados, periodos_debidos",
    )
    .gt("monto_adeudado", 0)
    .gte("dias_atraso", DIAS_RECOGER_BANDEJA);

  if (errAtrasos) throw new Error(errAtrasos.message);
  const filas = (atrasos ?? []) as AtrasoVistaRow[];
  if (!filas.length) return [];

  const compraIds = [...new Set(filas.map((a) => a.user_moto_compra_id))];
  const userIds = [
    ...new Set(
      filas
        .map((a) => a.user_id)
        .filter((id): id is number => id != null),
    ),
  ];

  const [comprasRes, usersRes] = await Promise.all([
    sb
      .from("user_moto_compra")
      .select("id, placa, monto_cuota_periodo, user_id")
      .in("id", compraIds),
    userIds.length
      ? sb
          .from("users")
          .select("id, user, digital_contracts(hoja_vida_data, created_at)")
          .in("id", userIds)
      : Promise.resolve({ data: [] as UserRow[], error: null }),
  ]);

  if (comprasRes.error) throw new Error(comprasRes.error.message);
  if (usersRes.error) throw new Error(usersRes.error.message);

  const compraById = new Map(
    ((comprasRes.data ?? []) as CompraRow[]).map((c) => [String(c.id), c]),
  );
  const userById = new Map(
    ((usersRes.data ?? []) as UserRow[]).map((u) => [Number(u.id), u]),
  );

  const out: AtrasoPinilla[] = [];
  for (const a of filas) {
    const mapped = mapearFilaPinilla({
      dias_atraso: a.dias_atraso,
      monto_adeudado: a.monto_adeudado,
      periodos_pagados: a.periodos_pagados,
      periodos_debidos: a.periodos_debidos,
      user_id: a.user_id,
      user_moto_compra: compraById.get(a.user_moto_compra_id) ?? null,
      users: a.user_id != null ? (userById.get(a.user_id) ?? null) : null,
    });
    if (mapped) out.push(mapped);
  }
  return out;
}

/** Cola oficial Pinilla (pendientes). Fallback a atrasos ≥ 4 días si RLS bloquea. */
export async function fetchAtrasosDesdeSpBogota(): Promise<AtrasoPinilla[]> {
  try {
    return await fetchDesdeMotosParaRecoger();
  } catch (e) {
    console.warn(
      "[atrasosFromSpBogota] motos_para_recoger:",
      e instanceof Error ? e.message : e,
    );
    try {
      return await fetchDesdeAtrasosBandeja();
    } catch (e2) {
      console.warn(
        "[atrasosFromSpBogota] atrasos fallback:",
        e2 instanceof Error ? e2.message : e2,
      );
      return [];
    }
  }
}
