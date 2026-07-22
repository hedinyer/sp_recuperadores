import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Calendario Marisol",
  robots: { index: false, follow: false },
};

export default function CalendarioMarisolLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
