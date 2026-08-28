"use client";

import { useId } from "react";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  SignalZeroIcon,
  WalletIcon,
} from "lucide-react";

import {
  CATEGORIAS_MOROSO,
  type CategoriaMoroso,
} from "@/lib/categoriasMorosos";
import { cn } from "@/lib/utils";

const ICONOS: Record<CategoriaMoroso, typeof WalletIcon> = {
  bajo_pago: WalletIcon,
  sin_gps: SignalZeroIcon,
  mora_15: AlertTriangleIcon,
  mora_4_15: CalendarClockIcon,
};

const LABEL_CORTO: Record<CategoriaMoroso, string> = {
  bajo_pago: "Bajo pago",
  sin_gps: "Sin GPS",
  mora_15: "+15d",
  mora_4_15: "4–15d",
};

export function MorososBandejas({
  categoria,
  onChange,
  counts,
  panelId = "morosos-panel-lista",
}: {
  categoria: CategoriaMoroso;
  onChange: (id: CategoriaMoroso) => void;
  counts: Record<CategoriaMoroso, number>;
  panelId?: string;
}) {
  const tabsId = useId();
  const ids = CATEGORIAS_MOROSO.map((c) => c.id);

  return (
    <div
      role="tablist"
      aria-label="Categorías de mora"
      className="grid w-full grid-cols-2 gap-2"
      onKeyDown={(e) => {
        const i = ids.indexOf(categoria);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(ids[(i + 1) % ids.length]!);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(ids[(i - 1 + ids.length) % ids.length]!);
        } else if (e.key === "Home") {
          e.preventDefault();
          onChange(ids[0]!);
        } else if (e.key === "End") {
          e.preventDefault();
          onChange(ids[ids.length - 1]!);
        }
      }}
    >
      {CATEGORIAS_MOROSO.map((cat) => {
        const active = categoria === cat.id;
        const Icon = ICONOS[cat.id];
        return (
          <button
            key={cat.id}
            id={`${tabsId}-tab-${cat.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(cat.id)}
            className={cn(
              "flex min-h-[3.5rem] flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex items-center gap-1.5 text-xs font-semibold leading-tight">
              <Icon className="size-3.5 shrink-0 opacity-90" aria-hidden />
              <span className="sm:hidden">{LABEL_CORTO[cat.id]}</span>
              <span className="hidden sm:inline">{cat.label}</span>
            </span>
            <span className="text-sm font-bold tabular-nums opacity-90">
              {counts[cat.id] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
