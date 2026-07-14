import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardCheck, Gamepad2, GitBranch } from "lucide-react";
import { PageHero } from "../components/PageHero";
import { PublicShell } from "../components/PublicShell";

export const metadata: Metadata = { title: "Como funciona", description: "Entenda cada etapa dos torneios Blox Rank BR.", alternates: { canonical: "/como-funciona" } };

const steps = [
  { icon: ClipboardCheck, title: "Entre no servidor", text: "O jogador entra no Discord oficial da comunidade." },
  { icon: BadgeCheck, title: "Faça sua inscrição", text: "O jogador preenche o formulário com suas informações." },
  { icon: GitBranch, title: "Aguarde a aprovação", text: "A organização verifica os dados e confirma a participação." },
  { icon: Gamepad2, title: "Dispute o torneio", text: "O vencedor avança e o perdedor é eliminado." },
];

export default function HowItWorksPage() {
  return <PublicShell><PageHero eyebrow="Passo a passo" title="Da ficha à final, sem confusão." description="Veja o caminho completo de quem entra na arena do Blox Rank BR." actions={<Link className="button button-primary" href="/inscricao">Começar inscrição <ArrowRight aria-hidden="true" /></Link>} />
    <section className="section"><ol className="steps-list">{steps.map(({ icon: Icon, title, text }, index) => <li key={title}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><Icon aria-hidden="true" /><div><h2>{title}</h2><p>{text}</p></div></li>)}</ol>
      <div className="explanation-grid"><article><strong>Como funciona o seed?</strong><p>O Bounty ou Honor informado ordena os participantes. Os seeds são distribuídos para que os melhores colocados não se enfrentem nas primeiras fases.</p></article><article><strong>E se alguém não aparecer?</strong><p>Ausência após o horário e a tolerância informados pela organização pode resultar em W.O.; o prazo oficial será comunicado no Discord.</p></article><article><strong>Quem acompanha?</strong><p>A equipe do Blox Rank BR acompanha as partidas e recebe as evidências necessárias.</p></article><article><strong>Quando sai o resultado?</strong><p>O placar aparece no chaveamento depois de ser registrado oficialmente pela organização.</p></article></div>
    </section>
    <section className="notice-panel"><div><span className="eyebrow">Antes de entrar</span><h2>Leia as regras confirmadas.</h2><p>Formato, vagas e critérios do torneio estão reunidos em uma página direta.</p></div><Link className="button button-secondary" href="/regras">Ver regras</Link></section>
  </PublicShell>;
}
