import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";
import { PublicShell } from "./components/PublicShell";

export default function NotFound() {
  return <PublicShell><section className="not-found"><span className="not-found-code">404</span><GitBranch aria-hidden="true" /><span className="eyebrow">Rota fora da chave</span><h1>Essa página não entrou no torneio.</h1><p>Volte ao início ou confira o chaveamento atual.</p><div className="hero-actions"><Link className="button button-primary" href="/"><ArrowLeft aria-hidden="true" /> Voltar ao início</Link><Link className="button button-secondary" href="/chaveamento">Ver chaveamento</Link></div></section></PublicShell>;
}
