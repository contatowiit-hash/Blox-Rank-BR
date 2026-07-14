import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DiscordButton } from "../components/DiscordButton";
import { PageHero } from "../components/PageHero";
import { PublicShell } from "../components/PublicShell";

export const metadata: Metadata = { title: "Perguntas frequentes", description: "Respostas rápidas sobre inscrição e torneios Blox Rank BR.", alternates: { canonical: "/faq" } };

const questions = [
  ["Preciso pagar para participar?", "Não. A inscrição da primeira edição é gratuita."],
  ["Posso jogar pelo celular?", "Sim. Celular é uma das plataformas aceitas no formulário de inscrição."],
  ["Posso jogar pelo console?", "Sim. Console também é uma das plataformas aceitas."],
  ["Como o chaveamento é definido?", "O chaveamento considera o Bounty/Honor dos participantes antes da primeira rodada."],
  ["Como funciona o W.O.?", "Ausência após o horário e a tolerância informados pela organização pode resultar em W.O.; o prazo oficial será comunicado no Discord."],
  ["O torneio terá premiação?", "Premiações só serão mostradas se forem oficialmente cadastradas pela organização."],
] as const;

export default function FaqPage() {
  return <PublicShell><PageHero eyebrow="Perguntas frequentes" title="Resposta rápida. Sem linguagem complicada." description="Abra uma pergunta para entender pagamento, plataformas, seed e regras." />
    <section className="section narrow-section"><div className="faq-list">{questions.map(([question, answer], index) => <details key={question}><summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{question}</strong><i aria-hidden="true">+</i></summary><p>{answer}</p></details>)}
      <details><summary><span>07</span><strong>Como entro em contato?</strong><i aria-hidden="true">+</i></summary><div className="faq-contact"><p>Use o Discord oficial configurado pelo Blox Rank BR.</p><DiscordButton cta /></div></details>
      <details><summary><span>08</span><strong>A liga é oficial?</strong><i aria-hidden="true">+</i></summary><p>Não. O Blox Rank BR é uma liga comunitária criada por fãs e não possui vínculo oficial com Roblox ou Blox Fruits.</p></details>
    </div></section>
    <section className="final-cta compact-cta"><div><span className="eyebrow">Tudo certo?</span><h2>Envie sua inscrição.</h2><p>Leva poucos minutos.</p></div><Link className="button button-primary" href="/inscricao">Começar <ArrowRight aria-hidden="true" /></Link></section>
  </PublicShell>;
}
