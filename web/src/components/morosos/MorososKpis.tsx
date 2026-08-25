"use client";

import { ChevronDownIcon } from "lucide-react";

import { KpisCarteraHoy } from "@/components/KpisCarteraHoy";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function MorososKpis({ tick }: { tick: number }) {
  return (
    <Collapsible defaultOpen={false} className="group/kpis">
      <CollapsibleTrigger className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-muted/40 px-3 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>Recaudo de hoy</span>
        <ChevronDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/kpis:rotate-180",
          )}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2 data-[state=closed]:animate-none">
        <KpisCarteraHoy tick={tick} />
      </CollapsibleContent>
    </Collapsible>
  );
}
