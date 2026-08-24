const CORTE = "19 de agosto de 2026";

const SANTANDER = {
  motos: 814,
  cartera: 724_241_577,
  alDia: 191,
  mora1a7: 343,
  moraMas7: 280,
};

const BOGOTA_CHIA = {
  motos: 206,
  cartera: 145_761_620,
  alDia: 29,
  mora1a7: 101,
  moraMas7: 76,
};

const CALLE_80 = {
  motos: 76,
  cartera: 5_835_003,
  alDia: 49,
  mora1a7: 24,
  moraMas7: 3,
};

const GIRARDOT = {
  motos: 23,
  cartera: 3_910_000,
  alDia: 9,
  mora1a7: 13,
  moraMas7: 1,
};

const ZONAS = [
  { nombre: "Santander / Bucaramanga", short: "Santander", ...SANTANDER },
  { nombre: "Bogotá / Chía", short: "Bogotá / Chía", ...BOGOTA_CHIA },
  { nombre: "Bogotá Calle 80", short: "Calle 80", ...CALLE_80 },
  { nombre: "Girardot", short: "Girardot", ...GIRARDOT },
] as const;

const TOTAL_MOTOS = ZONAS.reduce((s, z) => s + z.motos, 0);
const TOTAL_CARTERA = ZONAS.reduce((s, z) => s + z.cartera, 0);
const TALLER = 32_560_000;
const MAX_CARTERA = Math.max(...ZONAS.map((z) => z.cartera));

function millones(n: number): string {
  const m = n / 1_000_000;
  const txt = m >= 10 ? m.toFixed(0) : m.toFixed(1);
  return `$${txt} millones`;
}

function cop(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function pct(parte: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((parte / total) * 100)}%`;
}

function Stat({
  value,
  label,
  tone = "neutral",
}: {
  value: string;
  label: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : tone === "info"
            ? "text-sky-300"
            : "text-white";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-3">
      <p className={`text-lg font-bold tabular-nums tracking-tight ${color}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">{label}</p>
    </div>
  );
}

function Zona({
  titulo,
  z,
}: {
  titulo: string;
  z: (typeof ZONAS)[number];
}) {
  return (
    <section>
      <h2 className="mb-3 text-base font-semibold text-white">{titulo}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat value={z.motos.toLocaleString("es-CO")} label="Motos activas" />
        <Stat value={millones(z.cartera)} label="Deben en total" />
        <Stat
          value={z.alDia.toLocaleString("es-CO")}
          label={`Al día (${pct(z.alDia, z.motos)})`}
          tone="success"
        />
        <Stat
          value={z.mora1a7.toLocaleString("es-CO")}
          label={`1–7 días (${pct(z.mora1a7, z.motos)})`}
          tone="warning"
        />
        <Stat
          value={z.moraMas7.toLocaleString("es-CO")}
          label={`+7 días (${pct(z.moraMas7, z.motos)})`}
          tone="danger"
        />
      </div>
    </section>
  );
}

export default function InformeCarteraPage() {
  return (
    <div className="min-h-dvh bg-zinc-950 px-4 py-8 text-zinc-100 sm:px-8">
      <main className="mx-auto flex max-w-5xl flex-col gap-8">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Cartera de motos activas
        </h1>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat
            value={TOTAL_MOTOS.toLocaleString("es-CO")}
            label="Motos activas en total"
          />
          <Stat value={millones(TOTAL_CARTERA)} label="Cartera total que deben" />
          <Stat
            value={millones(SANTANDER.cartera)}
            label="De esa, en Santander"
            tone="info"
          />
        </div>

        <Zona titulo="Santander y Bucaramanga" z={ZONAS[0]} />
        <hr className="border-zinc-800" />
        <Zona titulo="Bogotá / Chía" z={ZONAS[1]} />
        <hr className="border-zinc-800" />
        <Zona titulo="Bogotá Calle 80" z={ZONAS[2]} />
        <hr className="border-zinc-800" />
        <Zona titulo="Girardot" z={ZONAS[3]} />

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              Cuánto deben, lado a lado
            </h2>
            <span className="text-[11px] text-zinc-500">millones de COP</span>
          </div>
          <div className="flex flex-col gap-3">
            {ZONAS.map((z) => {
              const w =
                MAX_CARTERA > 0
                  ? Math.max(8, (z.cartera / MAX_CARTERA) * 100)
                  : 0;
              return (
                <div key={z.nombre} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="text-zinc-300">{z.short}</span>
                    <span className="tabular-nums text-zinc-400">
                      ${Math.round(z.cartera / 1_000_000)} M
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-sky-500"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-white">
            Resumen en una tabla
          </h3>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="bg-zinc-900 text-zinc-400">
                <tr>
                  {[
                    "Zona",
                    "Motos activas",
                    "Cartera",
                    "Al día",
                    "1–7 días",
                    "+7 días",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ZONAS.map((z, i) => (
                  <tr
                    key={z.nombre}
                    className={
                      i === 0
                        ? "bg-sky-950/30 text-zinc-100"
                        : "border-t border-zinc-800 text-zinc-200"
                    }
                  >
                    <td className="px-3 py-2">{z.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {z.motos.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {cop(z.cartera)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                      {z.alDia.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                      {z.mora1a7.toLocaleString("es-CO")}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-300">
                      {z.moraMas7.toLocaleString("es-CO")}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-zinc-700 bg-zinc-900 font-semibold text-white">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {TOTAL_MOTOS.toLocaleString("es-CO")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {cop(TOTAL_CARTERA)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {ZONAS.reduce((s, z) => s + z.alDia, 0).toLocaleString(
                      "es-CO",
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {ZONAS.reduce((s, z) => s + z.mora1a7, 0).toLocaleString(
                      "es-CO",
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {ZONAS.reduce((s, z) => s + z.moraMas7, 0).toLocaleString(
                      "es-CO",
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-300">
          <p className="font-medium text-zinc-200">
            Dato aparte, no es la cartera de las motos
          </p>
          <p className="mt-1 text-zinc-400">
            Hay {cop(TALLER)} extra en créditos de taller o repuestos. No entra
            en las cifras de arriba.
          </p>
        </aside>

        <p className="text-[11px] text-zinc-600">
          Solo lectura, {CORTE}. Contrato activo y moto activa. GPS fuera de
          Santander entra en Bogotá / Chía. Sin GPS se queda en Santander. Al
          día = cero atraso. Luego 1–7 días y más de 7.
        </p>
      </main>
    </div>
  );
}
