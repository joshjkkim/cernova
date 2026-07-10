import type { Metadata } from "next";
import { Archivo, Geist_Mono, Newsreader, Courier_Prime } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Cernova",
  description: "Observability for AI workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displaySans.variable} ${geistMono.variable} ${newsreader.variable} ${courierPrime.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
