import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHero } from "../components/PageHero";
import { ParticipantsGrid } from "../components/ParticipantsGrid";
import { PublicShell } from "../components/PublicShell";

export const metadata: Metadata = { title: "Participantes", description: "Conheça os jogadores aprovados no torneio atual.", alternates: { canonical: "/participantes" } };

export default function ParticipantsPage() {
  return <PublicShell><PageHero eyebrow="Lista confirmada" title="Os nomes que entraram na arena." description="Veja apenas os jogadores aprovados no torneio atual, sem expor dados pessoais do Discord." actions={<Link className="button button-secondary" href="/chaveamento">Ver confrontos <ArrowRight aria-hidden="true" /></Link>} />
    <section className="section"><ParticipantsGrid /></section>
  </PublicShell>;
}
