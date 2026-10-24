import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniMarket · Operations Hub",
  description: "Centro de operaciones y pedidos",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
