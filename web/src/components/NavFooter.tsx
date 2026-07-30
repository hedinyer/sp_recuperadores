"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Consultar" },
  { href: "/placas", label: "Morosos" },
  { href: "/recoger-bogota", label: "Bogotá" },
  { href: "/recuperadores", label: "Recup." },
  { href: "/nicolas", label: "Admin" },
] as const;

export function NavFooter() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <footer className="relative z-50 shrink-0 border-t border-zinc-800/80 bg-zinc-950 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <nav
        aria-label="Navegación principal"
        className="w-full max-w-[414px] mx-auto flex gap-1"
      >
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={(e) => {
                // Fallback robusto para taps en móvil (iOS/Safari).
                e.preventDefault();
                router.push(link.href);
              }}
              className={`flex-1 min-h-[44px] flex items-center justify-center rounded-xl px-1 text-[11px] font-semibold text-center leading-tight touch-manipulation transition-colors ${
                active
                  ? "bg-emerald-700 text-white shadow-sm shadow-emerald-900/30"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-700 active:bg-zinc-800"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </footer>
  );
}
