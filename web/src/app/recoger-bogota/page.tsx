"use client";

import { MasterGate } from "@/components/MasterGate";
import { NavFooter } from "@/components/NavFooter";
import { RecogerBogotaWorkspace } from "@/components/recoger-bogota/RecogerBogotaWorkspace";

export default function RecogerBogotaPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground pt-[max(0.25rem,env(safe-area-inset-top))]">
      <MasterGate title="Bogotá" subtitle="Requiere clave master">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <RecogerBogotaWorkspace />
        </div>
      </MasterGate>
      <NavFooter />
    </div>
  );
}
