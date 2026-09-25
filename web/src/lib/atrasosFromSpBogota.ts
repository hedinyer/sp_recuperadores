import { analizarPatronPago, type PatronPago } from "@/lib/analisisMorosidad";
import { clientSedeSp, type SedeSpId } from "@/lib/spSedes";
import { normalizarPlaca } from "@/lib/syncPlacaEstado";

const PATRON_VACIO: PatronPago = analizarPatronPago([]);
const DIAS_RECOGER_BANDEJA = 4;

export type OrigenSpRecoger = "pinilla" | "bga" | "bogota";

export type AtrasoPinilla = {
  placa: string;
  cedula: string;
  nombre: string;
  telefono: string;
  valor_cuota: number;
  deuda_total: number;
  cuotas_pendientes: number;
  pago_hoy: false;
  origen: OrigenSpRecoger;
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
  estado?: string | null;
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

/** Fila SP → atraso de Recoger. Null si no hay placa, deuda o compra cancelada. */
export function mapearFilaPinilla(
  row: FilaMotosParaRecoger,
  origen: OrigenSpRecoger = "pinilla",
): AtrasoPinilla | null {
  const compra = uno(row.user_moto_compra);
  if (String(compra?.estado ?? "").toLowerCase() === "cancelada") return null;
  const placa = normalizarPlaca(compra?.placa ?? "");
  const deuda = Math.round(Number(row.monto_adeudado) || 0);
  if (!placa || deuda <= 0) return null;

  // ponytail: en SP la mora de calle es dias_atraso
  const pendientes = Math.max(0, Number(row.dias_atraso) || 0);

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
    origen,
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
    .map((row) => mapearFilaPinilla(row as FilaMotosParaRecoger, "pinilla"))
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

/** ponytail: .in() de a 200; si hay más ids, otra ronda. */
async function fetchIn<T>(
  sb: ReturnType<typeof clientSedeSp>,
  tabla: string,
  columnas: string,
  columnaId: string,
  ids: string[],
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await sb
      .from(tabla)
      .select(columnas)
      .in(columnaId, chunk);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function fetchDesdeAtrasosSede(
  sede: Extract<SedeSpId, "bga" | "bogota">,
  opts?: { minDias?: number; origen?: OrigenSpRecoger },
): Promise<AtrasoPinilla[]> {
  const sb = clientSedeSp(sede);
  const origen = opts?.origen ?? sede;
  const minDias = opts?.minDias ?? 0;
  const page = 1000;
  const filas: AtrasoVistaRow[] = [];

  for (let from = 0; ; from += page) {
    let q = sb
      .from("atrasos")
      .select(
        "user_moto_compra_id, user_id, monto_adeudado, dias_atraso, periodos_pagados, periodos_debidos",
      )
      .gt("monto_adeudado", 0)
      .range(from, from + page - 1);
    if (minDias > 0) q = q.gte("dias_atraso", minDias);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as AtrasoVistaRow[];
    filas.push(...batch);
    if (batch.length < page) break;
  }
  if (!filas.length) return [];

  const compraIds = [...new Set(filas.map((a) => a.user_moto_compra_id))];
  const userIds = [
    ...new Set(
      filas
        .map((a) => a.user_id)
        .filter((id): id is number => id != null)
        .map(String),
    ),
  ];

  const [compras, users] = await Promise.all([
    fetchIn<CompraRow>(
      sb,
      "user_moto_compra",
      "id, placa, monto_cuota_periodo, user_id, estado",
      "id",
      compraIds,
    ),
    userIds.length
      ? fetchIn<UserRow>(
          sb,
          "users",
          "id, user, digital_contracts(hoja_vida_data, created_at)",
          "id",
          userIds,
        )
      : Promise.resolve([] as UserRow[]),
  ]);

  const compraById = new Map(compras.map((c) => [String(c.id), c]));
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  const out: AtrasoPinilla[] = [];
  for (const a of filas) {
    const mapped = mapearFilaPinilla(
      {
        dias_atraso: a.dias_atraso,
        monto_adeudado: a.monto_adeudado,
        periodos_pagados: a.periodos_pagados,
        periodos_debidos: a.periodos_debidos,
        user_id: a.user_id,
        user_moto_compra: compraById.get(a.user_moto_compra_id) ?? null,
        users: a.user_id != null ? (userById.get(a.user_id) ?? null) : null,
      },
      origen,
    );
    if (mapped) out.push(mapped);
  }
  return out;
}

/** ponytail: si RLS tapa motos_para_recoger, atrasos ≥ 4 días es la misma bandeja. */
async function fetchDesdeAtrasosBandeja(): Promise<AtrasoPinilla[]> {
  return fetchDesdeAtrasosSede("bogota", {
    minDias: DIAS_RECOGER_BANDEJA,
    origen: "pinilla",
  });
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

function mergeAtrasosSp(listas: AtrasoPinilla[][]): AtrasoPinilla[] {
  const byPlaca = new Map<string, AtrasoPinilla>();
  for (const lista of listas) {
    for (const a of lista) {
      const key = normalizarPlaca(a.placa);
      if (!key) continue;
      const prev = byPlaca.get(key);
      if (!prev || a.deuda_total > prev.deuda_total) {
        byPlaca.set(key, {
          ...a,
          nombre: a.nombre || prev?.nombre || "",
          telefono: a.telefono || prev?.telefono || "",
          cedula: a.cedula || prev?.cedula || "",
        });
      } else {
        byPlaca.set(key, {
          ...prev,
          nombre: prev.nombre || a.nombre,
          telefono: prev.telefono || a.telefono,
          cedula: prev.cedula || a.cedula,
        });
      }
    }
  }
  return [...byPlaca.values()];
}

/** Pinilla oficial + morosos Bogotá + morosos BGA (deuda > 0). */
export async function fetchAtrasosSpParaRecoger(): Promise<AtrasoPinilla[]> {
  const [oficial, bogota, bga] = await Promise.all([
    fetchAtrasosDesdeSpBogota(),
    fetchDesdeAtrasosSede("bogota").catch((e) => {
      console.warn(
        "[atrasosFromSpBogota] bogota:",
        e instanceof Error ? e.message : e,
      );
      return [] as AtrasoPinilla[];
    }),
    fetchDesdeAtrasosSede("bga").catch((e) => {
      console.warn(
        "[atrasosFromSpBogota] bga:",
        e instanceof Error ? e.message : e,
      );
      return [] as AtrasoPinilla[];
    }),
  ]);
  return mergeAtrasosSp([oficial, bogota, bga]);
}
