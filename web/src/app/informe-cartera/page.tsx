import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Informe de cartera — motos activas",
  description:
    "Cuánto deben las motos activas, por zona, y qué conviene hacer esta semana.",
  robots: { index: false, follow: false },
};

const CORTE = "19 de agosto de 2026";

type Zona = {
  slug: string;
  nombre: string;
  titulo: string;
  short: string;
  motos: number;
  cartera: number;
  alDia: number;
  mora1a7: number;
  moraMas7: number;
  lectura: string;
  decision: string;
};

const ZONAS: Zona[] = [
  {
    slug: "santander",
    nombre: "Santander / Bucaramanga",
    titulo: "Santander y Bucaramanga",
    short: "Santander",
    motos: 814,
    cartera: 724_241_577,
    alDia: 191,
    mora1a7: 343,
    moraMas7: 280,
    lectura:
      "Aquí está casi todo el dinero. Ocho de cada diez pesos de la cartera viven en Santander. También está la mayor cantidad de motos ya vencidas más de una semana: 280.",
    decision:
      "Ponga aquí el equipo de cobro y las visitas. Las 343 de 1 a 7 días todavía se pueden alcanzar esta semana; las 280 de más de 7 días son el hueco grande.",
  },
  {
    slug: "bogota-chia",
    nombre: "Bogotá / Chía",
    titulo: "Bogotá / Chía",
    short: "Bogotá / Chía",
    motos: 206,
    cartera: 145_761_620,
    alDia: 29,
    mora1a7: 101,
    moraMas7: 76,
    lectura:
      "Es la zona menos puntual: solo 29 motos están al día. Casi la mitad ya va 1 a 7 días. El monto es el segundo más alto, lejos de Calle 80 y Girardot.",
    decision:
      "Trátela como operación propia, no como residuo de Santander. Hace falta seguimiento dedicado: 177 motos ya deben y el atraso se está formando ahora.",
  },
  {
    slug: "calle-80",
    nombre: "Bogotá Calle 80",
    titulo: "Bogotá Calle 80",
    short: "Calle 80",
    motos: 76,
    cartera: 5_835_003,
    alDia: 49,
    mora1a7: 24,
    moraMas7: 3,
    lectura:
      "Es la cartera más sana: 64% al día y poco dinero en juego. Cada moto debe, en promedio, mucho menos que en Santander. No mueve la caja de la empresa.",
    decision:
      "Mantenga el ritmo actual. Las 3 de más de 7 días sí hay que cerrarlas; no desvíe gente de Santander por este frente.",
  },
  {
    slug: "girardot",
    nombre: "Girardot",
    titulo: "Girardot",
    short: "Girardot",
    motos: 23,
    cartera: 3_910_000,
    alDia: 9,
    mora1a7: 13,
    moraMas7: 1,
    lectura:
      "Son pocas motos y poco dinero. El riesgo no es el monto: es que 13 de 23 ya van 1 a 7 días. Si se dejan, mañana se parecen a un atraso largo en miniatura.",
    decision:
      "Una ronda de cobro esta semana alcanza. Es barato de enderezar ahora y caro de ignorar si se mezcla con el ruido de Santander.",
  },
];

const TOTAL_MOTOS = ZONAS.reduce((s, z) => s + z.motos, 0);
const TOTAL_CARTERA = ZONAS.reduce((s, z) => s + z.cartera, 0);
const TOTAL_AL_DIA = ZONAS.reduce((s, z) => s + z.alDia, 0);
const TOTAL_1A7 = ZONAS.reduce((s, z) => s + z.mora1a7, 0);
const TOTAL_MAS7 = ZONAS.reduce((s, z) => s + z.moraMas7, 0);
const TALLER = 32_560_000;
const MAX_CARTERA = Math.max(...ZONAS.map((z) => z.cartera));

const COLOR = {
  alDia: { fill: "#047857", label: "text-emerald-800", swatch: "bg-emerald-700" },
  d1a7: { fill: "#b45309", label: "text-amber-800", swatch: "bg-amber-700" },
  mas7: { fill: "#b91c1c", label: "text-red-800", swatch: "bg-red-700" },
} as const;

function millones(n: number): string {
  const m = n / 1_000_000;
  return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}\u00a0millones`;
}

function cop(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function pct(parte: number, total: number): string {
  if (total === 0) return "0%";
  const p = (parte / total) * 100;
  if (p > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  start: number,
  sweep: number,
): string {
  if (sweep >= 359.99) {
    return `M ${cx} ${cy} m 0 ${-r} a ${r} ${r} 0 1 1 0 ${r * 2} a ${r} ${r} 0 1 1 0 ${-r * 2}`;
  }
  const end = start + sweep;
  const a = polar(cx, cy, r, start);
  const b = polar(cx, cy, r, end);
  const large = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

type PieSlice = { label: string; value: number; fill: string };

function PieChart({
  title,
  slices,
  format = "count",
}: {
  title: string;
  slices: PieSlice[];
  format?: "count" | "money";
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let cursor = 0;
  const paths = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const sweep = total === 0 ? 0 : (s.value / total) * 360;
      const d = slicePath(48, 48, 40, cursor, sweep);
      cursor += sweep;
      return { ...s, d };
    });

  return (
    <figure className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 96 96"
        width="160"
        height="160"
        className="size-40 shrink-0"
        aria-hidden="true"
        focusable="false"
      >
        {paths.map((p) => (
          <path key={p.label} d={p.d} fill={p.fill} />
        ))}
      </svg>
      <figcaption className="min-w-0">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-sm leading-snug text-zinc-700">
          {slices.map((s) => (
            <li key={s.label} className="flex items-baseline justify-between gap-4">
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.fill }}
                  aria-hidden="true"
                />
                {s.label}
              </span>
              <span className="tabular-nums text-zinc-900">
                {format === "money"
                  ? millones(s.value)
                  : s.value.toLocaleString("es-CO")}
                <span className="ms-1 text-zinc-600">({pct(s.value, total)})</span>
              </span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

function Stat({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-100 px-3 py-3">
      <p className="text-xl font-semibold tracking-tight text-zinc-900 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-sm leading-snug text-zinc-600">{label}</p>
    </div>
  );
}

function moraSlices(z: Pick<Zona, "alDia" | "mora1a7" | "moraMas7">): PieSlice[] {
  return [
    { label: "Al día", value: z.alDia, fill: COLOR.alDia.fill },
    { label: "1–7 días de atraso", value: z.mora1a7, fill: COLOR.d1a7.fill },
    { label: "Más de 7 días", value: z.moraMas7, fill: COLOR.mas7.fill },
  ];
}

export default function InformeCarteraPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-8">
        <header className="flex flex-col gap-3 border-b border-zinc-200 pb-8">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-600">
            Informe para dirección
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Cartera de motos activas
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-pretty text-zinc-700">
            Corte del {CORTE}. Cuánto deben hoy las motos en operación, dónde
            está el dinero y qué conviene hacer esta semana.
          </p>
        </header>

        <section aria-labelledby="resumen-titulo" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 id="resumen-titulo" className="text-xl font-semibold tracking-tight">
              Lo que importa
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-pretty text-zinc-700">
              Hay {TOTAL_MOTOS.toLocaleString("es-CO")} motos activas y deben{" "}
              {millones(TOTAL_CARTERA)}. Santander concentra el{" "}
              {pct(ZONAS[0].cartera, TOTAL_CARTERA)} de esa plata. En el país,
              solo {pct(TOTAL_AL_DIA, TOTAL_MOTOS)} está al día. El grupo más
              grande no es el de atraso largo: son {TOTAL_1A7.toLocaleString("es-CO")}{" "}
              motos con 1 a 7 días. Si no se cobran ahora, pasan al grupo difícil
              ({TOTAL_MAS7.toLocaleString("es-CO")} motos ya van más de una semana).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              value={TOTAL_MOTOS.toLocaleString("es-CO")}
              label="Motos activas"
            />
            <Stat value={millones(TOTAL_CARTERA)} label="Deben en total" />
            <Stat
              value={millones(ZONAS[0].cartera)}
              label="De esa, en Santander"
            />
          </div>

          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <PieChart
              title="Cómo están las motos, en el total"
              slices={moraSlices({
                alDia: TOTAL_AL_DIA,
                mora1a7: TOTAL_1A7,
                moraMas7: TOTAL_MAS7,
              })}
            />
            <PieChart
              title="Dónde está el dinero que deben"
              format="money"
              slices={ZONAS.map((z) => ({
                label: z.short,
                value: z.cartera,
                fill:
                  z.short === "Santander"
                    ? "#1d4ed8"
                    : z.short === "Bogotá / Chía"
                      ? "#0369a1"
                      : z.short === "Calle 80"
                        ? "#0f766e"
                        : "#57534e",
              }))}
            />
          </div>
        </section>

        <section aria-labelledby="decisiones-titulo" className="flex flex-col gap-4">
          <h2 id="decisiones-titulo" className="text-xl font-semibold tracking-tight">
            Qué conviene hacer esta semana
          </h2>
          <ol className="flex max-w-2xl flex-col gap-4 text-base leading-relaxed text-zinc-700">
            <li>
              <span className="font-medium text-zinc-900">
                Centre gente en Santander.
              </span>{" "}
              Ahí está el {pct(ZONAS[0].cartera, TOTAL_CARTERA)} de la cartera y
              280 motos con más de 7 días. Cualquier visita fuera de esa zona
              rinde menos plata.
            </li>
            <li>
              <span className="font-medium text-zinc-900">
                Cobre primero las de 1 a 7 días.
              </span>{" "}
              Son {TOTAL_1A7.toLocaleString("es-CO")} motos, el grupo más grande.
              Todavía están cerca; en siete días más se vuelven el problema caro.
            </li>
            <li>
              <span className="font-medium text-zinc-900">
                No deje Bogotá / Chía en segundo plano.
              </span>{" "}
              Solo 14% está al día. Es el segundo pozo de dinero y el peor
              cumplimiento.
            </li>
            <li>
              <span className="font-medium text-zinc-900">
                Calle 80 y Girardot: no distraigan.
              </span>{" "}
              Juntas son menos del 2% de la plata. En Girardot, una ronda a las
              13 motos de 1 a 7 días cierra el frente. En Calle 80, 3 motos de
              más de 7 días.
            </li>
          </ol>
        </section>

        {ZONAS.map((z) => (
          <section
            key={z.nombre}
            aria-labelledby={`zona-${z.slug}`}
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col gap-3">
              <h2
                id={`zona-${z.slug}`}
                className="text-balance text-xl font-semibold tracking-tight"
              >
                {z.titulo}
              </h2>
              <p className="max-w-2xl text-base leading-relaxed text-pretty text-zinc-700">
                {z.lectura} {z.decision}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Stat
                value={z.motos.toLocaleString("es-CO")}
                label="Motos activas"
              />
              <Stat value={millones(z.cartera)} label="Deben en total" />
              <Stat
                value={`${z.alDia.toLocaleString("es-CO")} (${pct(z.alDia, z.motos)})`}
                label="Al día"
              />
              <Stat
                value={`${z.mora1a7.toLocaleString("es-CO")} (${pct(z.mora1a7, z.motos)})`}
                label="1–7 días"
              />
              <Stat
                value={`${z.moraMas7.toLocaleString("es-CO")} (${pct(z.moraMas7, z.motos)})`}
                label="Más de 7 días"
              />
            </div>
            <PieChart
              title={`Estado de las motos en ${z.short}`}
              slices={moraSlices(z)}
            />
          </section>
        ))}

        <section aria-labelledby="barras-titulo" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <h2 id="barras-titulo" className="text-xl font-semibold tracking-tight">
              Cuánto deben, lado a lado
            </h2>
            <p className="text-sm text-zinc-600">Millones de pesos</p>
          </div>
          <ul className="flex flex-col gap-4">
            {ZONAS.map((z) => {
              const w =
                MAX_CARTERA > 0
                  ? Math.max(4, (z.cartera / MAX_CARTERA) * 100)
                  : 0;
              return (
                <li key={z.short}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span>{z.short}</span>
                    <span className="tabular-nums text-zinc-900">
                      ${Math.round(z.cartera / 1_000_000)}&nbsp;M
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200">
                    <div
                      className="h-full rounded-full bg-blue-700"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="tabla-titulo" className="flex flex-col gap-4">
          <h2 id="tabla-titulo" className="text-xl font-semibold tracking-tight">
            Resumen por zona
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[36rem] text-start text-sm">
              <caption className="sr-only">
                Motos, cartera y atraso por zona, con total
              </caption>
              <thead className="bg-zinc-100 text-zinc-700">
                <tr>
                  {[
                    "Zona",
                    "Motos activas",
                    "Cartera",
                    "Al día",
                    "1–7 días",
                    "Más de 7 días",
                  ].map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className={`px-3 py-3 font-medium ${i === 0 ? "text-start" : "text-end"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ZONAS.map((z) => (
                  <tr key={z.nombre} className="border-t border-zinc-200">
                    <th scope="row" className="px-3 py-2.5 text-start font-medium">
                      {z.nombre}
                    </th>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {z.motos.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2.5 text-end tabular-nums">
                      {cop(z.cartera)}
                    </td>
                    <td className={`px-3 py-2.5 text-end tabular-nums ${COLOR.alDia.label}`}>
                      {z.alDia.toLocaleString("es-CO")}
                    </td>
                    <td className={`px-3 py-2.5 text-end tabular-nums ${COLOR.d1a7.label}`}>
                      {z.mora1a7.toLocaleString("es-CO")}
                    </td>
                    <td className={`px-3 py-2.5 text-end tabular-nums ${COLOR.mas7.label}`}>
                      {z.moraMas7.toLocaleString("es-CO")}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-300 bg-zinc-100 font-semibold">
                  <th scope="row" className="px-3 py-2.5 text-start">
                    Total
                  </th>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {TOTAL_MOTOS.toLocaleString("es-CO")}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {cop(TOTAL_CARTERA)}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {TOTAL_AL_DIA.toLocaleString("es-CO")}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {TOTAL_1A7.toLocaleString("es-CO")}
                  </td>
                  <td className="px-3 py-2.5 text-end tabular-nums">
                    {TOTAL_MAS7.toLocaleString("es-CO")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <aside className="max-w-2xl rounded-xl bg-zinc-100 px-4 py-4 text-sm leading-relaxed text-pretty text-zinc-700">
          Hay {cop(TALLER)} extra en créditos de taller o repuestos. No entra en
          las cifras de arriba: es otra cuenta.
        </aside>

        <p className="max-w-2xl text-sm leading-relaxed text-pretty text-zinc-600">
          Contrato activo y moto activa. Si el GPS está fuera de Santander, la
          moto entra en Bogotá / Chía. Sin GPS se cuenta en Santander. Al día
          significa cero atraso. Luego 1–7 días y más de 7.
        </p>
      </main>
    </div>
  );
}
