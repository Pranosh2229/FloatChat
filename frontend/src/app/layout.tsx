import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

import { TopNav } from "@/components/shell/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif for the big cinematic lines and hand-written annotations (REDESIGN_PLAN.md
// visual system: serif display + clean sans body + mono data labels).
const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "FLOATCHAT — Ask the ocean",
  description:
    "Natural-language questions over real ARGO ocean observations, with evidence-backed scientific analysis and an explorable ocean world.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--paper)] text-[var(--graphite)]">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
