/** Nombre guardado en BD (`nombre_recuperador`) y etiqueta corta en la UI. */
export type RecuperadorOption = {
  nombre: string;
  etiqueta: string;
};

export const RECUPERADORES: RecuperadorOption[] = [
  { nombre: "John Sáenz", etiqueta: "Jhon" },
  { nombre: "Diego Rodríguez", etiqueta: "Diego" },
  { nombre: "Moisés Ojeda", etiqueta: "Chipiri" },
  { nombre: "David Berastegui", etiqueta: "Berastegui" },
  { nombre: "Fabián Garzón", etiqueta: "Fabian" },
  { nombre: "Nicolás Garrido", etiqueta: "Nicolas" },
  { nombre: "Everth baptista", etiqueta: "Everth" },
];

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
