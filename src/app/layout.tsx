import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "COT · Your trading village",
  description:
    "Local player-facing COT prototype with fake accounts and shared device state.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
