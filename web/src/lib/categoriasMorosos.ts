export type CategoriaMoroso =
  | "cuotas_1_5"
  | "cuotas_6_10"
  | "cuotas_11_16"
  | "cuotas_17";

export const CATEGORIAS_MOROSO: Array<{
  id: CategoriaMoroso;
  label: string;
  descripcion: string;
}> = [
  {
    id: "cuotas_1_5",
    label: "1 a 5 cuotas",
    descripcion: "De 1 a 5 cuotas pendientes",
  },
  {
    id: "cuotas_6_10",
    label: "6 a 10 cuotas",
    descripcion: "De 6 a 10 cuotas pendientes",
  },
  {
    id: "cuotas_11_16",
    label: "11 a 16 cuotas",
    descripcion: "De 11 a 16 cuotas pendientes",
  },
  {
    id: "cuotas_17",
    label: "17+ cuotas",
    descripcion: "17 o más cuotas pendientes",
  },
];

export type ItemParaCategoria = {
  deuda_total: number;
  cuotas_pendientes: number;
};

function cuotasParaBandeja(item: ItemParaCategoria): number {
  if (item.deuda_total <= 0) return 0;
  const n = Math.ceil(Number(item.cuotas_pendientes) || 0);
  return n > 0 ? n : 0;
}

/**
 * Categorías exclusivas por cuotas pendientes.
 * null = no entra en ninguna bandeja.
 */
function cumpleCategoriaMoroso(
  cat: CategoriaMoroso,
  item: ItemParaCategoria,
): boolean {
  return clasificarCategoriaMoroso(item) === cat;
}

export function clasificarCategoriaMoroso(
  item: ItemParaCategoria,
): CategoriaMoroso | null {
  const n = cuotasParaBandeja(item);
  if (n < 1) return null;
  if (n <= 5) return "cuotas_1_5";
  if (n <= 10) return "cuotas_6_10";
  if (n <= 16) return "cuotas_11_16";
  return "cuotas_17";
}

export function etiquetaCategoriaMoroso(
  id: CategoriaMoroso | string | null | undefined,
): string {
  if (!id) return "";
  return CATEGORIAS_MOROSO.find((c) => c.id === id)?.label ?? id;
}

export function esCategoriaMoroso(
  value: string | null | undefined,
): value is CategoriaMoroso {
  return CATEGORIAS_MOROSO.some((c) => c.id === value);
}

/** Bandeja fija: se respeta salvo que ya no cumpla el umbral. */
export function categoriaMorosoEstable(
  guardada: string | null | undefined,
  enVivo: CategoriaMoroso | null,
  item?: ItemParaCategoria,
): CategoriaMoroso | null {
  if (!esCategoriaMoroso(guardada)) return enVivo;
  if (!item) return guardada;
  if (!cumpleCategoriaMoroso(guardada, item)) return enVivo;
  return guardada;
}

export function emptyCategoriasMoroso<T>(
  factory: () => T,
): Record<CategoriaMoroso, T> {
  return Object.fromEntries(
    CATEGORIAS_MOROSO.map((c) => [c.id, factory()]),
  ) as Record<CategoriaMoroso, T>;
}
