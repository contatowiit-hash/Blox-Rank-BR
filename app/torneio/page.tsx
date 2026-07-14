import type { Metadata } from "next";
import { GitBranch, Medal, Users } from "lucide-react";
import { PageHero } from "../components/PageHero";
import { PublicShell } from "../components/PublicShell";
import { TournamentOverview } from "../components/TournamentOverview";

export const metadata: Metadata = { title: "Torneio atual", description: "Acompanhe o torneio atual do Blox Rank BR.", alternates: { canonical: "/torneio" } };

export default function TournamentPage() {
  return <PublicShell><PageHero eyebrow="Torneio atual" title="Uma chave. Dezesseis nomes. Um caminho até a final." description="Acompanhe o estado oficial do torneio e acesse os dados publicados pela organização." />
    <section className="section"><TournamentOverview /></section>
    <section className="section format-section"><div className="section-heading"><div><span className="eyebrow">Formato confirmado</span><h2>Competição direta.</h2></div></div><div className="format-grid"><article><Users aria-hidden="true" /><strong>16 jogadores</strong><p>A chave só é gerada quando há exatamente 16 inscrições aprovadas.</p></article><article><GitBranch aria-hidden="true" /><strong>Seeds por desempenho</strong><p>O Bounty ou Honor organiza os jogadores antes da primeira rodada.</p></article><article><Medal aria-hidden="true" /><strong>Mata-mata X1</strong><p>Confrontos melhor de 3; a grande final será disputada em melhor de 5.</p></article></div></section>
  </PublicShell>;
}
