/** Nombre guardado en BD (`nombre_recuperador`) y etiqueta corta en la UI. */
export type RecuperadorOption = {
  nombre: string;
  etiqueta: string;
  /** Archivo en `public/` (ej. jhon.jpeg). Vacío = solo inicial en la carta. */
  foto: string;
};

export const RECUPERADORES: RecuperadorOption[] = [
  { nombre: "John Sáenz", etiqueta: "Jhon", foto: "jhon.jpeg" },
  { nombre: "Moisés Ojeda", etiqueta: "Chipiri", foto: "berasthegui.jpeg" },
  { nombre: "David Berastegui", etiqueta: "Berastegui", foto: "chipiri.jpeg" },
  { nombre: "Fabián Garzón", etiqueta: "Fabian", foto: "" },
  { nombre: "Nicolás Garrido", etiqueta: "Nicolas", foto: "" },
  { nombre: "Everth baptista", etiqueta: "Everth", foto: "everth.jpeg" },
];

export function fotoRecuperadorUrl(foto: string): string {
  return `/${foto}`;
}

/** Nombres canónicos para selects y API (sin Jean Pier ni Josué). */
export const RECUPERADORES_FIJOS = RECUPERADORES.map((r) => r.nombre);

export function etiquetaRecuperador(nombre: string | null | undefined): string {
  if (!nombre) return "";
  const exacto = RECUPERADORES.find((r) => r.nombre === nombre);
  if (exacto) return exacto.etiqueta;
  const lower = nombre.trim().toLowerCase();
  const porNombre = RECUPERADORES.find(
    (r) => r.nombre.toLowerCase() === lower,
  );
  return porNombre?.etiqueta ?? nombre;
}
