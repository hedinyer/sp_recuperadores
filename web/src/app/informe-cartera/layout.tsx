import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Cartera de motos activas",
  robots: { index: false, follow: false },
};

export default function InformeCarteraLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
