/**
 * Self-check: episodios + buckets (ponytail).
 * Run: npx tsx src/lib/carteraEfectividad.selfcheck.ts
 */
import {
  bucketDesdeDias,
  construirEpisodios,
  diasEntre,
  sugerirSiguiente,
  type GestionEfect,
  type MetodoStats,
} from "./carteraEfectividad";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const base: GestionEfect[] = [
  {
    placa: "ABC12D",
    perfil_id: "dayana",
    status: "contactado",
    created_at: "2026-08-20T14:00:00-05:00",
  },
  {
    placa: "ABC12D",
    perfil_id: "dayana",
    status: "compromiso",
    created_at: "2026-08-20T16:00:00-05:00",
  },
  {
    placa: "ABC12D",
    perfil_id: "dayana",
    status: "abono",
    created_at: "2026-08-20T18:00:00-05:00",
    monto: 150000,
  },
];

const eps = construirEpisodios(base, []);
assert(eps.length === 1, "un episodio");
assert(eps[0]!.bucket === "mismo_dia", "mismo día");
assert(eps[0]!.n_gestiones === 3, "3 gestiones");
assert(eps[0]!.monto_recuperado === 150000, "monto");
assert(eps[0]!.last_touch === "compromiso", "last touch");

const erp = construirEpisodios(
  [
    {
      placa: "XYZ45A",
      perfil_id: "jhon_saenz",
      status: "visita",
      created_at: "2026-08-20T10:00:00-05:00",
    },
  ],
  [{ fecha: "2026-08-21", valor: 200000 }],
);
assert(erp[0]!.outcome === "erp", "erp outcome");
assert(erp[0]!.bucket === "dia_siguiente", "día siguiente");
assert(diasEntre("2026-08-20", "2026-08-21") === 1, "diasEntre");
assert(bucketDesdeDias(null) === "sin_pago", "sin pago");

const sug = sugerirSiguiente("contactado", [
  {
    status: "visita",
    label: "Visita",
    usos_last_touch: 10,
    conversiones: 8,
    tasa: 0.8,
    monto_medio: 100000,
    dias_medio: 2,
    recompensa_media: 50000,
    peso: 2,
  },
] as MetodoStats[]);
assert(sug === "visita", "sugerencia visita");

console.log("carteraEfectividad.selfcheck: ok");
