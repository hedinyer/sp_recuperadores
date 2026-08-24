export type CarteraPerfilId =
  | "jhon_saenz"
  | "dayana"
  | "santiago_saenz"
  | "angie_garcia"
  | "mauricio_perucho";

export type CarteraPerfil = {
  id: CarteraPerfilId;
  nombre: string;
};

export const CARTERA_PERFILES: CarteraPerfil[] = [
  { id: "jhon_saenz", nombre: "Jhon Sáenz" },
  { id: "dayana", nombre: "Dayana" },
  { id: "santiago_saenz", nombre: "Santiago Sáenz" },
  { id: "angie_garcia", nombre: "Angie García" },
  { id: "mauricio_perucho", nombre: "Mauricio Perucho" },
];

export const CARTERA_PERFIL_STORAGE_KEY = "cartera_perfil_id";

export function esPerfilCarteraId(value: string): value is CarteraPerfilId {
  return CARTERA_PERFILES.some((p) => p.id === value);
}

export function nombrePerfilCartera(id: string | null | undefined): string {
  if (!id) return "";
  return CARTERA_PERFILES.find((p) => p.id === id)?.nombre ?? id;
}

export type CarteraStatus =
  | "pendiente"
  | "contactado"
  | "compromiso"
  | "abono"
  | "no_contesta"
  | "visita"
  | "en_ruta"
  | "recuperada"
  | "cerrado";

export const CARTERA_STATUSES: Array<{
  id: CarteraStatus;
  label: string;
}> = [
  { id: "pendiente", label: "Pendiente" },
  { id: "contactado", label: "Contactado" },
  { id: "compromiso", label: "Compromiso de pago" },
  { id: "abono", label: "Abono" },
  { id: "no_contesta", label: "No contesta" },
  { id: "visita", label: "Visita" },
  { id: "en_ruta", label: "En ruta" },
  { id: "recuperada", label: "Recuperada" },
  { id: "cerrado", label: "Cerrado" },
];

export function esCarteraStatus(value: string): value is CarteraStatus {
  return CARTERA_STATUSES.some((s) => s.id === value);
}

export function etiquetaCarteraStatus(status: string | null | undefined): string {
  if (!status) return "Pendiente";
  return CARTERA_STATUSES.find((s) => s.id === status)?.label ?? status;
}
