import type { Metadata } from "next";
import { BracketBoard } from "../components/BracketBoard";
import { PageHero } from "../components/PageHero";
import { PublicShell } from "../components/PublicShell";

export const metadata: Metadata = { title: "Chaveamento", description: "Veja partidas, resultados e rodadas do torneio Blox Rank BR.", alternates: { canonical: "/chaveamento" } };

export default function BracketPage() {
  return <PublicShell><PageHero eyebrow="Chaveamento ao vivo" title="Cada duelo muda o caminho." description="Acompanhe confrontos, placares e vencedores em todas as rodadas." />
    <section className="section section-wide"><BracketBoard /></section>
  </PublicShell>;
}
