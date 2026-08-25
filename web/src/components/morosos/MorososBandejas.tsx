"use client";

import { useId } from "react";

import {
  CATEGORIAS_MOROSO,
  type CategoriaMoroso,
} from "@/lib/categoriasMorosos";
import { cn } from "@/lib/utils";

export function MorososBandejas({
  categoria,
  onChange,
  counts,
}: {
  categoria: CategoriaMoroso;
  onChange: (id: CategoriaMoroso) => void;
  counts: Record<CategoriaMoroso, number>;
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
        return (
          <button
            key={cat.id}
            id={`${tabsId}-tab-${cat.id}`}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(cat.id)}
            className={cn(
              "flex min-h-[3.25rem] flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-xs font-semibold leading-tight">
              {cat.label}
            </span>
            <span className="text-xs tabular-nums opacity-80">
              {counts[cat.id] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
