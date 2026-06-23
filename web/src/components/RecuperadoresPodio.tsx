type PodioEntrada = {
  puesto: 1 | 2 | 3;
  nombre: string;
};

type Props = {
  top3: PodioEntrada[];
};

const ALTURA: Record<1 | 2 | 3, string> = {
  1: "h-[5.5rem]",
  2: "h-[4.25rem]",
  3: "h-14",
};

const BADGE: Record<1 | 2 | 3, string> = {
  1: "bg-amber-400 text-amber-950 shadow-amber-500/40",
  2: "bg-zinc-300 text-zinc-800 shadow-zinc-400/30",
  3: "bg-amber-700 text-amber-50 shadow-amber-900/40",
};

const ORDEN_PODIO: (1 | 2 | 3)[] = [2, 1, 3];

function BadgePuesto({ puesto }: { puesto: 1 | 2 | 3 }) {
  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center text-sm font-black tabular-nums shadow-md ${BADGE[puesto]}`}
      style={{ clipPath: "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)" }}
      aria-hidden
    >
      {puesto}
    </span>
  );
}

function ColumnaPodio({ entrada }: { entrada: PodioEntrada }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-end min-w-0">
      <p className="mb-2 w-full truncate text-center text-xs font-bold text-white sm:text-sm">
        {entrada.nombre}
      </p>
      <div
        className={`relative flex w-full items-center justify-center rounded-t-lg bg-violet-950/90 border border-violet-800/60 ${ALTURA[entrada.puesto]}`}
      >
        <BadgePuesto puesto={entrada.puesto} />
      </div>
    </div>
  );
}

export function RecuperadoresPodio({ top3 }: Props) {
  const porPuesto = new Map(top3.map((e) => [e.puesto, e]));
  const columnas = ORDEN_PODIO.map((p) => porPuesto.get(p)).filter(
    (e): e is PodioEntrada => Boolean(e),
  );

  if (columnas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-violet-900/50 bg-violet-950/20 px-4 py-6 text-center">
        <p className="text-xs text-violet-300/70">Sin dinero recuperado este mes</p>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-3 pt-4 pb-0"
      style={{
        background:
          "radial-gradient(ellipse 120% 80% at 50% 0%, rgba(139,92,246,0.35) 0%, rgba(76,29,149,0.2) 45%, rgba(24,24,27,0) 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        aria-hidden
        style={{
          background:
            "repeating-conic-gradient(from 0deg at 50% 120%, rgba(167,139,250,0.08) 0deg 15deg, transparent 15deg 30deg)",
        }}
      />
      <div className="relative flex items-end gap-1.5 sm:gap-2">
        {columnas.map((entrada) => (
          <ColumnaPodio key={entrada.puesto} entrada={entrada} />
        ))}
      </div>
    </div>
  );
}
