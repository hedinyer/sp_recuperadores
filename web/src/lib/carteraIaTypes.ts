/** Tipos del harness IA de cobro. */

export const IA_INTENTS = [
  "compromiso_pago",
  "no_contesta",
  "excusa",
  "agresivo",
  "pagara_otro_dia",
  "otro",
] as const;

export type IaIntent = (typeof IA_INTENTS)[number];

export const ALERTA_KINDS = [
  "compromiso_hoy",
  "compromiso_vencido",
  "rompe_promesa",
  "prioridad",
] as const;

export type AlertaKind = (typeof ALERTA_KINDS)[number];

export const FOLLOWUP_STATUSES = [
  "pendiente",
  "disparado",
  "cancelado",
  "cumplido",
] as const;

export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export type ExtractorResult = {
  intent: IaIntent;
  fecha_compromiso_iso: string | null;
  monto_prometido: number | null;
  resumen: string;
  confianza: number;
};

export type ComportamientoResult = {
  cumplio_promesas_previas: boolean | null;
  riesgo: "bajo" | "medio" | "alto";
  senal: string;
};

export type AnalizarResumen = {
  procesadas: number;
  compromisos: number;
  followups: number;
  alertas: number;
  errores: string[];
};

export type AlertaRow = {
  id: number;
  perfil_id: string;
  placa: string;
  titulo: string;
  cuerpo: string | null;
  kind: AlertaKind;
  read_at: string | null;
  followup_id: number | null;
  created_at: string;
};
