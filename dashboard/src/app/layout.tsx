import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reflex Duel Dashboard",
  description: "Live stats for the STM32G474RE reflex duel game",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
