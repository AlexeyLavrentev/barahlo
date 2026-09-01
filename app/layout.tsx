import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist Mono is retained (variable --font-mono) for tabular numerals —
// serial/inventory columns in phases 3+. Body text uses the system stack
// from globals.css (Geist Sans had no Cyrillic subset — UI-SPEC decision).
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Учёт техники",
  description: "Внутренний учёт корпоративной техники",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
