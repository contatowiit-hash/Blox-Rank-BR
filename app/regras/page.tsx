import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { PageHero } from "../components/PageHero";
import { PublicShell } from "../components/PublicShell";

export const metadata: Metadata = { title: "Regras", description: "Regras confirmadas dos torneios Blox Rank BR.", alternates: { canonical: "/regras" } };

const rules = [
  ["Regras gerais", "A primeira edição terá inscrição gratuita, 16 jogadores, partidas X1 em mata-mata, confrontos melhor de 3 e final melhor de 5."],
  ["Respeito", "Jogadores, equipe e comunidade devem ser tratados com respeito durante toda a competição."],
  ["Scripts e exploits", "O uso de scripts, exploits ou qualquer alteração indevida do jogo é proibido."],
  ["Macros e vantagens externas", "Macros e ferramentas externas que criem vantagem são proibidas. Casos serão analisados pelas evidências disponíveis; não existe promessa de detecção automática ou 100% garantida."],
  ["W.O.", "Ausência após o horário e a tolerância informados pela organização pode resultar em W.O.; o prazo oficial será comunicado no Discord."],
  ["Lag e desconexão", "Situações de lag ou queda serão avaliadas pela organização com base no contexto e nas evidências da partida."],
  ["Provas e denúncias", "Denúncias devem ser enviadas pelo Discord oficial com informações e evidências que permitam a análise da equipe."],
  ["Comportamento dos espectadores", "Espectadores não podem interferir na partida, assediar jogadores ou atrapalhar o trabalho da organização."],
  ["Decisões da organização", "A organização avalia resultados, ocorrências e denúncias com base nas regras publicadas e nas evidências disponíveis."],
] as const;

export default function RulesPage() {
  return <PublicShell><PageHero eyebrow="Regras da arena" title="Jogue limpo. Respeite a disputa." description="Leia as nove categorias que orientam participantes e espectadores." />
    <section className="section"><div className="rules-list">{rules.map(([title, text], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><ShieldCheck aria-hidden="true" /><div><h2>{title}</h2><p>{text}</p></div></article>)}</div></section>
    <section className="notice-panel"><div><span className="eyebrow">Aviso importante</span><h2>Uma liga feita pela comunidade.</h2><p>O Blox Rank BR é uma liga comunitária criada por fãs e não possui vínculo oficial com Roblox ou Blox Fruits.</p></div><Link className="button button-primary" href="/faq">Ver dúvidas frequentes <ArrowRight aria-hidden="true" /></Link></section>
  </PublicShell>;
}
