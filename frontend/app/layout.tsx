import type { Metadata } from "next";
import { Archivo, Geist_Mono, Newsreader, Courier_Prime, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const displaySans = Archivo({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Landing type system: print editorial — Newsreader serif + Courier Prime typewriter.
const newsreader = Newsreader({
  variable: "--font-news",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const courierPrime = Courier_Prime({
  variable: "--font-type",
  weight: ["400", "700"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Flight console type system: Space Grotesk display + IBM Plex Mono instruments.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cernova — autopilot for AI agents",
  description:
    "Cernova is the autopilot for AI agents in production. It learns what every step should do, catches the silent failures your logs call success, and closes the loop — so you're not the one babysitting the agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displaySans.variable} ${geistMono.variable} ${newsreader.variable} ${courierPrime.variable} ${spaceGrotesk.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
