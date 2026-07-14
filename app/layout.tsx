import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getPublicSiteUrl } from "./lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: getPublicSiteUrl(),
  title: { default: "Blox Rank BR — Liga de PvP de Blox Fruits", template: "%s | Blox Rank BR" },
  description: "Participe de torneios comunitários de PvP de Blox Fruits em formato mata-mata, com chaveamento organizado e partidas acompanhadas pelo Blox Rank BR.",
  applicationName: "Blox Rank BR",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  alternates: { canonical: "/" },
  keywords: ["Blox Rank BR", "Blox Fruits", "torneio", "comunidade brasileira"],
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Blox Rank BR",
    url: "/",
    title: "Blox Rank BR — Liga de PvP de Blox Fruits",
    description: "Participe de torneios comunitários de PvP de Blox Fruits em formato mata-mata, com chaveamento organizado e partidas acompanhadas pelo Blox Rank BR.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Blox Rank BR" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Blox Rank BR — Liga de PvP de Blox Fruits",
    description: "Participe de torneios comunitários de PvP de Blox Fruits em formato mata-mata, com chaveamento organizado e partidas acompanhadas pelo Blox Rank BR.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#080b12",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
