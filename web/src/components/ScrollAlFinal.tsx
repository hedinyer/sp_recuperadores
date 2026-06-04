"use client";

import { useCallback, useEffect, useState } from "react";

const UMBRAL_FINAL_PX = 56;

function contenedorConScroll(): HTMLElement {
  const candidatos = document.querySelectorAll<HTMLElement>("main, [data-scroll-main]");
  for (const el of candidatos) {
    const { overflowY } = getComputedStyle(el);
    const scrolleable =
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay";
    if (scrolleable && el.scrollHeight > el.clientHeight + UMBRAL_FINAL_PX) {
      return el;
    }
  }
  return document.documentElement;
}

function estaCercaDelFinal(el: HTMLElement): boolean {
  const top = el === document.documentElement ? window.scrollY : el.scrollTop;
  const alto = el === document.documentElement ? window.innerHeight : el.clientHeight;
  return top + alto >= el.scrollHeight - UMBRAL_FINAL_PX;
}

function hayScrollDisponible(el: HTMLElement): boolean {
  return el.scrollHeight > el.clientHeight + UMBRAL_FINAL_PX;
}

export function ScrollAlFinal() {
  const [visible, setVisible] = useState(false);

  const actualizar = useCallback(() => {
    const el = contenedorConScroll();
    setVisible(hayScrollDisponible(el) && !estaCercaDelFinal(el));
  }, []);

  useEffect(() => {
    actualizar();
    const t = window.setTimeout(actualizar, 400);
    document.addEventListener("scroll", actualizar, true);
    window.addEventListener("resize", actualizar);
    const obs = new MutationObserver(() => actualizar());
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("scroll", actualizar, true);
      window.removeEventListener("resize", actualizar);
      obs.disconnect();
    };
  }, [actualizar]);

  const irAlFinal = useCallback(() => {
    const el = contenedorConScroll();
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    window.setTimeout(actualizar, 500);
  }, [actualizar]);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={irAlFinal}
      aria-label="Ir al final de la página"
      title="Ir al final"
      className="fixed z-40 right-4 w-12 h-12 rounded-full bg-emerald-700 text-white shadow-lg shadow-black/40 border border-emerald-500/40 flex items-center justify-center touch-manipulation active:scale-95 transition-transform bottom-[calc(4.75rem+env(safe-area-inset-bottom))]"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6"
        aria-hidden
      >
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    </button>
  );
}
