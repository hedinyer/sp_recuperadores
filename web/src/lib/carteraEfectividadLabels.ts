import {
  etiquetaCarteraStatus,
  type CarteraStatus,
} from "@/lib/carteraPerfiles";

/** Tipos y etiquetas seguros para client components (sin pg). */

export type BucketPago =
  | "mismo_dia"
  | "dia_siguiente"
  | "2_7"
  | "8_plus"
  | "sin_pago";

export type OutcomeTipo = "abono" | "erp" | "recuperada" | "cerrado";

export type Episodio = {
  placa: string;
  inicio_at: string;
  fin_at: string | null;
  cerrado: boolean;
  outcome: OutcomeTipo | null;
  dias_hasta_pago: number | null;
  bucket: BucketPago;
  n_gestiones: number;
  monto_recuperado: number;
  esfuerzo: number;
  recompensa: number;
  last_touch: string | null;
  categoria: string | null;
  sugerencia: string | null;
};

export type MetodoStats = {
  status: string;
  label: string;
  usos_last_touch: number;
  conversiones: number;
  tasa: number;
  monto_medio: number;
  dias_medio: number | null;
  recompensa_media: number;
  peso: number;
};

export type ClienteEfect = {
  placa: string;
  nombre: string;
  telefono: string;
  deuda_total: number;
  dias_mora: number;
  categoria: string | null;
  episodio: Episodio;
};

export type ResumenEfect = {
  recaudado: number;
  episodios_cerrados: number;
  episodios_abiertos: number;
  dias_mediana: number | null;
  gestiones_mediana: number | null;
  recompensa_media: number;
};

export function etiquetaBucket(b: BucketPago): string {
  switch (b) {
    case "mismo_dia":
      return "Mismo día";
    case "dia_siguiente":
      return "Día siguiente";
    case "2_7":
      return "2–7 días";
    case "8_plus":
      return "8+ días";
    default:
      return "Sin pago aún";
  }
}

export function etiquetaSugerencia(status: string | null): string {
  if (!status) return "";
  return etiquetaCarteraStatus(status as CarteraStatus);
}
