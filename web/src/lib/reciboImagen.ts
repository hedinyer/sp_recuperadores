import { toPng } from "html-to-image";

import {
  guardarFotoEnCache,
  leerFotoDeCache,
  normalizarPlaca,
} from "@/lib/fotoComprobante";

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(header)?.[1] ?? "image/png";
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo leer la foto"));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("No se pudo convertir la imagen"));
    reader.readAsDataURL(blob);
  });
}

/** Convierte URL remota (Supabase) a data URL; prioriza caché local por placa. */
async function urlImagenADataUrl(
  url: string,
  placa?: string,
): Promise<string> {
  if (url.startsWith("data:")) return url;

  if (placa) {
    const enCache = await leerFotoDeCache(placa);
    if (enCache) return enCache;
  }

  const res = await fetch(
    `/api/imagen-proxy?url=${encodeURIComponent(url)}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error("No se pudo cargar la imagen del comprobante");
  const dataUrl = await blobToDataUrl(await res.blob());
  if (placa) await guardarFotoEnCache(placa, dataUrl);
  return dataUrl;
}

async function esperarImagenLista(img: HTMLImageElement): Promise<void> {
  if (typeof img.decode === "function") {
    try {
      await img.decode();
      return;
    } catch {
      // continuar con onload
    }
  }
  if (img.complete && img.naturalWidth > 0) return;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

/**
 * Sustituye temporalmente las &lt;img&gt; por data URLs para que html-to-image
 * no dibuje cuadros negros (CORS / canvas tainted).
 */
async function inlineImagenesParaCaptura(
  element: HTMLElement,
): Promise<Map<HTMLImageElement, string>> {
  const originals = new Map<HTMLImageElement, string>();
  const images = Array.from(element.querySelectorAll("img"));

  for (const img of images) {
    const original = img.currentSrc || img.src;
    if (!original) continue;
    originals.set(img, original);

    const placaAttr = img.dataset.placa;
    const placa = placaAttr ? normalizarPlaca(placaAttr) : undefined;

    try {
      const dataUrl = await urlImagenADataUrl(original, placa);
      img.src = dataUrl;
      img.removeAttribute("crossorigin");
      await esperarImagenLista(img);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    } catch {
      // Si falla, se deja la URL original
    }
  }

  return originals;
}

/** Espera imágenes del recibo y genera PNG (evita fallos por carga pendiente o CORS). */
export async function capturarReciboPng(element: HTMLElement): Promise<string> {
  const originals = await inlineImagenesParaCaptura(element);

  const opciones = {
    backgroundColor: "#09090b",
    cacheBust: false as const,
  };

  try {
    try {
      return await toPng(element, { ...opciones, pixelRatio: 2 });
    } catch {
      return await toPng(element, { ...opciones, pixelRatio: 1 });
    }
  } finally {
    for (const [img, src] of originals) {
      img.src = src;
    }
  }
}

export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = nombre;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function abrirWhatsAppConTexto(texto: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
  window.location.assign(url);
}

/** Comparte imagen + texto; si no puede, abre WhatsApp y descarga el PNG. */
export async function compartirReciboWhatsApp(
  texto: string,
  dataUrl: string,
  nombreArchivo: string,
): Promise<"share" | "wa_y_descarga" | "solo_texto"> {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], nombreArchivo, { type: "image/png" });

  if (typeof navigator.share === "function") {
    try {
      const payload: ShareData = { text: texto, files: [file] };
      if (!navigator.canShare || navigator.canShare(payload)) {
        await navigator.share(payload);
        return "share";
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "share";
    }
  }

  abrirWhatsAppConTexto(texto);
  descargarBlob(blob, nombreArchivo);
  return "wa_y_descarga";
}
