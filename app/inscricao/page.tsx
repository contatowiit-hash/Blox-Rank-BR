import type { Metadata } from "next";
import { PageHero } from "../components/PageHero";
import { PublicShell } from "../components/PublicShell";
import { RegistrationForm } from "../components/RegistrationForm";

export const metadata: Metadata = { title: "Inscrição", description: "Envie sua inscrição para o torneio Blox Rank BR.", alternates: { canonical: "/inscricao" } };

export default function RegistrationPage() {
  return <PublicShell><PageHero eyebrow="Entre na disputa" title="Sua inscrição começa aqui." description="Preencha com atenção. A equipe usa essas informações para analisar sua entrada no torneio." />
    <section className="section registration-section"><RegistrationForm /></section>
  </PublicShell>;
}
