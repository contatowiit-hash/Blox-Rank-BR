import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Crosshair, ShieldCheck, Swords, Trophy } from "lucide-react";
import { PageHero } from "./components/PageHero";
import { DiscordButton } from "./components/DiscordButton";
import { ParticipantsGrid } from "./components/ParticipantsGrid";
import { PublicShell } from "./components/PublicShell";
import { TournamentOverview } from "./components/TournamentOverview";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function HomePage() {
  return (
    <PublicShell>
      <PageHero
        eyebrow="Competitivo brasileiro // Blox Fruits"
        title="PROVE SEU NÍVEL NO PVP"
        description="O Blox Rank BR organiza torneios comunitários de Blox Fruits em formato mata-mata, com partidas acompanhadas, chaveamento organizado e divulgação dos melhores confrontos."
        actions={<><Link className="button button-primary" href="/inscricao">Participar do torneio <ArrowRight aria-hidden="true" /></Link><Link className="button button-secondary" href="/chaveamento">Ver chaveamento</Link><DiscordButton cta /></>}
      />

      <section className="signal-strip" aria-label="Destaques do torneio">
        <div><strong>16</strong><span>participantes por chave</span></div>
        <div><Swords aria-hidden="true" /><span>mata-mata direto</span></div>
        <div><ShieldCheck aria-hidden="true" /><span>resultados pela equipe</span></div>
      </section>

      <section className="section edition-section">
        <div className="section-heading"><div><span className="eyebrow">1ª edição</span><h2>Informações da disputa</h2></div></div>
        <div className="edition-grid">
          {["16 jogadores", "Mata-mata", "Partidas X1", "Melhor de 3", "Final melhor de 5", "Inscrição gratuita"].map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><strong>{item}</strong></div>)}
        </div>
      </section>

      <section className="section section-live">
        <div className="section-heading"><div><span className="eyebrow">Agora no BRB</span><h2>Torneio em destaque</h2></div><Link className="text-link" href="/torneio">Página do torneio <ArrowRight aria-hidden="true" /></Link></div>
        <TournamentOverview compact />
      </section>

      <section className="section section-angle">
        <div className="section-heading"><div><span className="eyebrow">Da inscrição à final</span><h2>Competir ficou simples.</h2></div></div>
        <div className="feature-grid">
          <article><span>01</span><Crosshair aria-hidden="true" /><h3>Envie sua inscrição</h3><p>Informe seu jogador e seus dados do Discord em poucos passos.</p></article>
          <article><span>02</span><CheckCircle2 aria-hidden="true" /><h3>Aguarde a análise</h3><p>A equipe confere as informações e confirma quem entra na chave.</p></article>
          <article><span>03</span><Trophy aria-hidden="true" /><h3>Dispute cada rodada</h3><p>Partidas e resultados aparecem no chaveamento público.</p></article>
        </div>
        <Link className="text-link section-link" href="/como-funciona">Entenda o passo a passo <ArrowRight aria-hidden="true" /></Link>
      </section>

      <section className="section">
        <div className="section-heading"><div><span className="eyebrow">Quem já está na arena</span><h2>Participantes confirmados</h2></div><Link className="text-link" href="/participantes">Ver todos <ArrowRight aria-hidden="true" /></Link></div>
        <ParticipantsGrid limit={4} />
      </section>

      <section className="final-cta">
        <div><span className="eyebrow">Sua próxima batalha</span><h2>Pronto para colocar seu rank à prova?</h2><p>Faça sua inscrição e deixe a equipe cuidar do resto.</p></div>
        <Link className="button button-primary" href="/inscricao">Entrar na disputa <ArrowRight aria-hidden="true" /></Link>
      </section>
    </PublicShell>
  );
}
