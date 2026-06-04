"use client";

import type { ReactNode } from "react";

import { ScrollAlFinal } from "@/components/ScrollAlFinal";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ScrollAlFinal />
    </>
  );
}
