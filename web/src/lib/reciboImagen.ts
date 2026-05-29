import { toPng } from "html-to-image";

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = /:(.*?);/.exec(header)?.[1] ?? "image/png";
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

/** Espera imágenes del recibo y genera PNG (evita fallos por carga pendiente). */
export async function capturarReciboPng(element: HTMLElement): Promise<string> {
  const images = element.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );

  const opciones = {
    backgroundColor: "#09090b",
    cacheBust: true,
  };

  try {
    return await toPng(element, { ...opciones, pixelRatio: 2 });
  } catch {
    return await toPng(element, { ...opciones, pixelRatio: 1 });
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
