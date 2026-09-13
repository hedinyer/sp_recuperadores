import type { SedeId, TotalesKpi, VentaFila } from "@/lib/ventasTipos";

export type MixKeyCount = {
  key: string;
  n: number;
  estimado_cop: number;
  contado_n: number;
  credito_n: number;
};

export type MixModeloColor = {
  modelo: string;
  color: string;
  n: number;
};

export type MixSedeCC = {
  sede: SedeId;
  sede_label: string;
  contado_n: number;
  credito_n: number;
};

export type MixValorModelo = {
  key: string;
  n: number;
  estimado_cop: number;
  contado_valor: number;
};

export type MixTicketSede = {
  sede: SedeId;
  sede_label: string;
  ticket_contado: number;
  inicial_media_credito: number;
  n_contado: number;
  n_credito: number;
};

export type MixInicialModelo = {
  key: string;
  inicial_media: number;
  n: number;
};

export type MixPayload = {
  por_modelo: MixKeyCount[];
  por_color: Array<{ key: string; n: number; estimado_cop: number }>;
  modelo_color: MixModeloColor[];
  sede_modelo: Array<{
    sede: SedeId;
    sede_label: string;
    modelos: Record<string, number>;
  }>;
  top_modelos_stack: string[];
  por_frecuencia: Array<{ key: string; n: number }>;
  por_dow: Array<{ dow: number; label: string; n: number }>;
  contado_credito_por_sede: MixSedeCC[];
  valor_por_modelo: MixValorModelo[];
  ticket_por_sede: MixTicketSede[];
  inicial_media_por_modelo: MixInicialModelo[];
  pareto_modelo: Array<{ key: string; n: number; pct_acum: number }>;
};

const DOW_LABEL = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const SEDE_LABEL: Record<SedeId, string> = {
  bga: "BGA",
  girardot: "Girardot",
  bogota: "Bogotá",
  railweb: "Railweb",
};

function slugClave(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Inserta espacio entre letras y cifras: nkd125 → nkd 125. */
function separarLetrasNumeros(s: string): string {
  return s
    .replace(/([a-záéíóúñ]+)(\d+)/gi, "$1 $2")
    .replace(/(\d+)([a-záéíóúñ]+)/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

type LineaCanon = { re: RegExp; label: string };

// ponytail: catálogo corto de líneas SP/Railweb; si aparece otra, cae a title-case.
const LINEAS: LineaCanon[] = [
  { re: /\bnkd\b/, label: "NKD 125" },
  { re: /\bsbr\b/, label: "SBR 150" },
  { re: /\bgbr\b/, label: "GBR 200" },
  { re: /\bchr\b/, label: "CHR 125" },
  { re: /\bmilan\b/, label: "Milan 150" },
  { re: /\bflex\b/, label: "Flex 110" },
  { re: /\brockz\b/, label: "Rockz" },
];

function titleCaseEs(s: string): string {
  return s
    .toLocaleLowerCase("es-CO")
    .replace(/(^|\s)\S/g, (c) => c.toLocaleUpperCase("es-CO"));
}

/**
 * Unifica variantes SP/Railweb:
 * "BERA SBR 150" | "Sbr 150" | "SBR150" | "SBR" → "SBR 150"
 * "AKT NKD 125" | "NKD125" → "NKD 125"
 */
export function normalizarModelo(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (!raw) return "Sin dato";
  const slug = slugClave(separarLetrasNumeros(raw));
  const hadBera = /\bbera\b/.test(slug);
  const hadAkt = /\bakt\b/.test(slug);
  let s = slug.replace(/^(akt|bera|tvs|yamaha)\s+/, "");
  // typo habitual
  s = s.replace(/\bsbr\s*151\b/, "sbr 150");

  for (const { re, label } of LINEAS) {
    if (re.test(s) || re.test(slug)) return label;
  }

  // "BERA150" / "AKT125" sin código de línea
  if (/^150$/.test(s) && hadBera) return "SBR 150";
  if (/^200$/.test(s) && hadBera) return "GBR 200";
  if (/^125$/.test(s) && hadAkt) return "NKD 125";

  // solo marca sin línea
  if (/^(akt|bera|tvs|yamaha)$/.test(s)) return titleCaseEs(s);
  return titleCaseEs(s);
}

const COLOR_ALIAS: Record<string, string> = {
  morada: "Morado",
  morado: "Morado",
  negra: "Negro",
  negro: "Negro",
  "negro mate": "Negro mate",
  "negro brillante": "Negro brillante",
  "gris mate": "Gris mate",
  "blanco negro": "Blanco negro",
  "azul oscuro": "Azul oscuro",
  vinotinto: "Vinotinto",
};

export function normalizarColor(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (!raw) return "Sin dato";
  const s = slugClave(raw);
  if (COLOR_ALIAS[s]) return COLOR_ALIAS[s];
  return titleCaseEs(s);
}

const FREQ_ALIAS: Record<string, string> = {
  diario: "Diario",
  diario_7: "Diario",
  "diario 7": "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  anual: "Anual",
};

export function normalizarFrecuencia(v: string | null | undefined): string {
  const raw = (v ?? "").trim();
  if (!raw) return "Sin dato";
  const s = slugClave(raw).replace(/\s+/g, "_");
  const s2 = slugClave(raw);
  return FREQ_ALIAS[s] ?? FREQ_ALIAS[s2] ?? titleCaseEs(s2);
}

/** @deprecated usar normalizarModelo / Color / Frecuencia */
export function normalizarTexto(v: string | null | undefined): string {
  return titleCaseEs(slugClave(v ?? "") || "Sin dato");
}

function weekdayBogota(ymd: string): number {
  return new Date(`${ymd}T12:00:00-05:00`).getUTCDay();
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00-05:00`);
  d.setTime(d.getTime() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Fecha calendario America/Bogota (YYYY-MM-DD). */
export function hoyBogota(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Últimos `dias` calendario hasta `hasta` (default: hoy Bogotá). */
export function filtrarUltimosDias(
  ventas: VentaFila[],
  dias: number,
  hasta = hoyBogota(),
): VentaFila[] {
  if (!hasta) return [];
  const desde = addDaysYmd(hasta, -(dias - 1));
  return ventas.filter((v) => v.fecha >= desde && v.fecha <= hasta);
}

export function totalesDesdeVentas(ventas: VentaFila[]): TotalesKpi {
  let contado_n = 0;
  let contado_valor = 0;
  let credito_n = 0;
  let credito_valor_sp = 0;
  let credito_valor_railweb = 0;
  let credito_estimado_total = 0;
  let credito_inicial_total = 0;
  for (const v of ventas) {
    if (v.tipo === "contado") {
      contado_n += 1;
      contado_valor += v.valor;
    } else {
      credito_n += 1;
      credito_estimado_total += v.valor;
      credito_inicial_total += v.inicial ?? 0;
      if (v.sede === "railweb") credito_valor_railweb += v.valor;
      else credito_valor_sp += v.inicial ?? 0;
    }
  }
  return {
    contado_n,
    contado_valor,
    credito_n,
    credito_valor_sp,
    credito_valor_railweb,
    credito_estimado_total,
    credito_inicial_total,
    total_n: ventas.length,
  };
}

/** KPIs de la ventana + periodo anterior de igual duración (para Δ). */
export function kpisDeVentana(
  ventas: VentaFila[],
  dias: number,
  /** Fin de ventana (default: hoy Bogotá). */
  hastaAncla?: string,
): { desde: string; hasta: string; totales: TotalesKpi; totales_prev: TotalesKpi } {
  const hasta = hastaAncla || hoyBogota();
  const desde = addDaysYmd(hasta, -(dias - 1));
  const actual = ventas.filter((v) => v.fecha >= desde && v.fecha <= hasta);
  const prevHasta = addDaysYmd(desde, -1);
  const prevDesde = addDaysYmd(prevHasta, -(dias - 1));
  const prev = ventas.filter(
    (v) => v.fecha >= prevDesde && v.fecha <= prevHasta,
  );
  return {
    desde,
    hasta,
    totales: totalesDesdeVentas(actual),
    totales_prev: totalesDesdeVentas(prev),
  };
}

function topNConOtros<T extends { key: string; n: number }>(
  rows: T[],
  n: number,
  merge: (otros: T[]) => T,
): T[] {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n);
  const rest = rows.slice(n);
  if (rest.length === 0) return top;
  return [...top, merge(rest)];
}

/** Agrega mix categórico a partir de ventas (historia o periodo). */
export function construirMix(ventas: VentaFila[]): MixPayload {
  const modeloMap = new Map<string, MixKeyCount>();
  const colorMap = new Map<string, { key: string; n: number; estimado_cop: number }>();
  const mcMap = new Map<string, MixModeloColor>();
  const freqMap = new Map<string, number>();
  const dowArr = Array.from({ length: 7 }, (_, i) => ({
    dow: i,
    label: DOW_LABEL[i],
    n: 0,
  }));
  const sedeCC: Record<SedeId, MixSedeCC> = {
    bga: { sede: "bga", sede_label: SEDE_LABEL.bga, contado_n: 0, credito_n: 0 },
    girardot: {
      sede: "girardot",
      sede_label: SEDE_LABEL.girardot,
      contado_n: 0,
      credito_n: 0,
    },
    bogota: {
      sede: "bogota",
      sede_label: SEDE_LABEL.bogota,
      contado_n: 0,
      credito_n: 0,
    },
    railweb: {
      sede: "railweb",
      sede_label: SEDE_LABEL.railweb,
      contado_n: 0,
      credito_n: 0,
    },
  };
  const sedeModelo = new Map<SedeId, Map<string, number>>();
  const valorModelo = new Map<string, MixValorModelo>();
  const ticketAcc: Record<
    SedeId,
    { contadoSum: number; nContado: number; inicialSum: number; nCredito: number }
  > = {
    bga: { contadoSum: 0, nContado: 0, inicialSum: 0, nCredito: 0 },
    girardot: { contadoSum: 0, nContado: 0, inicialSum: 0, nCredito: 0 },
    bogota: { contadoSum: 0, nContado: 0, inicialSum: 0, nCredito: 0 },
    railweb: { contadoSum: 0, nContado: 0, inicialSum: 0, nCredito: 0 },
  };
  const inicialModelo = new Map<string, { sum: number; n: number }>();

  for (const v of ventas) {
    if (!v.fecha) continue;
    const modelo = normalizarModelo(v.modelo);
    const color = normalizarColor(v.color);
    const freq = normalizarFrecuencia(v.frecuencia);

    const m = modeloMap.get(modelo) ?? {
      key: modelo,
      n: 0,
      estimado_cop: 0,
      contado_n: 0,
      credito_n: 0,
    };
    m.n += 1;
    if (v.tipo === "contado") {
      m.contado_n += 1;
      sedeCC[v.sede].contado_n += 1;
      ticketAcc[v.sede].contadoSum += v.valor;
      ticketAcc[v.sede].nContado += 1;
    } else {
      m.credito_n += 1;
      m.estimado_cop += v.valor;
      sedeCC[v.sede].credito_n += 1;
      ticketAcc[v.sede].inicialSum += v.inicial ?? 0;
      ticketAcc[v.sede].nCredito += 1;
      const im = inicialModelo.get(modelo) ?? { sum: 0, n: 0 };
      im.sum += v.inicial ?? 0;
      im.n += 1;
      inicialModelo.set(modelo, im);
    }
    modeloMap.set(modelo, m);

    const c = colorMap.get(color) ?? { key: color, n: 0, estimado_cop: 0 };
    c.n += 1;
    if (v.tipo === "credito") c.estimado_cop += v.valor;
    colorMap.set(color, c);

    const mck = `${modelo}|${color}`;
    const mc = mcMap.get(mck) ?? { modelo, color, n: 0 };
    mc.n += 1;
    mcMap.set(mck, mc);

    if (v.tipo === "credito" && freq !== "Sin dato") {
      freqMap.set(freq, (freqMap.get(freq) ?? 0) + 1);
    }

    dowArr[weekdayBogota(v.fecha)].n += 1;

    if (!sedeModelo.has(v.sede)) sedeModelo.set(v.sede, new Map());
    const sm = sedeModelo.get(v.sede)!;
    sm.set(modelo, (sm.get(modelo) ?? 0) + 1);

    const vm = valorModelo.get(modelo) ?? {
      key: modelo,
      n: 0,
      estimado_cop: 0,
      contado_valor: 0,
    };
    vm.n += 1;
    if (v.tipo === "credito") vm.estimado_cop += v.valor;
    else vm.contado_valor += v.valor;
    valorModelo.set(modelo, vm);
  }

  const por_modelo = topNConOtros(
    [...modeloMap.values()].sort((a, b) => b.n - a.n),
    8,
    (rest) => ({
      key: "Otros",
      n: rest.reduce((s, r) => s + r.n, 0),
      estimado_cop: rest.reduce((s, r) => s + r.estimado_cop, 0),
      contado_n: rest.reduce((s, r) => s + r.contado_n, 0),
      credito_n: rest.reduce((s, r) => s + r.credito_n, 0),
    }),
  );

  const por_color = topNConOtros(
    [...colorMap.values()].sort((a, b) => b.n - a.n),
    8,
    (rest) => ({
      key: "Otros",
      n: rest.reduce((s, r) => s + r.n, 0),
      estimado_cop: rest.reduce((s, r) => s + r.estimado_cop, 0),
    }),
  );

  // heatmap: top 6 modelos × top 6 colores
  const topModelos = [...modeloMap.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((m) => m.key);
  const topColores = [...colorMap.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
    .map((c) => c.key);
  const modelo_color = [...mcMap.values()]
    .filter((x) => topModelos.includes(x.modelo) && topColores.includes(x.color))
    .sort((a, b) => b.n - a.n);

  const top_modelos_stack = [...modeloMap.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((m) => m.key);

  const sede_modelo = (["bga", "girardot", "bogota", "railweb"] as SedeId[]).map(
    (sede) => {
      const map = sedeModelo.get(sede) ?? new Map();
      const modelos: Record<string, number> = {};
      let otros = 0;
      for (const [k, n] of map) {
        if (top_modelos_stack.includes(k)) modelos[k] = n;
        else otros += n;
      }
      if (otros > 0) modelos["Otros"] = otros;
      return { sede, sede_label: SEDE_LABEL[sede], modelos };
    },
  );

  const por_frecuencia = [...freqMap.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n);

  const totalN = ventas.length || 1;
  let acum = 0;
  const pareto_modelo = [...modeloMap.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 12)
    .map((r) => {
      acum += r.n;
      return {
        key: r.key,
        n: r.n,
        pct_acum: Math.round((acum / totalN) * 1000) / 10,
      };
    });

  const valor_por_modelo = topNConOtros(
    [...valorModelo.values()].sort(
      (a, b) => b.estimado_cop + b.contado_valor - (a.estimado_cop + a.contado_valor),
    ),
    8,
    (rest) => ({
      key: "Otros",
      n: rest.reduce((s, r) => s + r.n, 0),
      estimado_cop: rest.reduce((s, r) => s + r.estimado_cop, 0),
      contado_valor: rest.reduce((s, r) => s + r.contado_valor, 0),
    }),
  );

  const ticket_por_sede = (
    ["bga", "girardot", "bogota", "railweb"] as SedeId[]
  ).map((sede) => {
    const t = ticketAcc[sede];
    return {
      sede,
      sede_label: SEDE_LABEL[sede],
      ticket_contado: t.nContado ? Math.round(t.contadoSum / t.nContado) : 0,
      inicial_media_credito: t.nCredito
        ? Math.round(t.inicialSum / t.nCredito)
        : 0,
      n_contado: t.nContado,
      n_credito: t.nCredito,
    };
  });

  const inicial_media_por_modelo = [...inicialModelo.entries()]
    .map(([key, v]) => ({
      key,
      inicial_media: Math.round(v.sum / v.n),
      n: v.n,
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8);

  return {
    por_modelo,
    por_color,
    modelo_color,
    sede_modelo,
    top_modelos_stack,
    por_frecuencia,
    por_dow: dowArr,
    contado_credito_por_sede: Object.values(sedeCC),
    valor_por_modelo,
    ticket_por_sede,
    inicial_media_por_modelo,
    pareto_modelo,
  };
}
