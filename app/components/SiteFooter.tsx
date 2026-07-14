import Link from "next/link";
import { Brand } from "./Brand";
import { CommunityLinks } from "./CommunityLinks";
import { SystemStatus } from "./SystemStatus";

const footerLinks = [
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/regras", label: "Regras" },
  { href: "/parceiros", label: "Parceiros" },
  { href: "/faq", label: "Perguntas frequentes" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        <div className="footer-brand">
          <Brand compact />
          <p>A arena competitiva brasileira feita para a comunidade de Blox Fruits.</p>
          <CommunityLinks />
          <SystemStatus />
        </div>
        <nav aria-label="Links do rodapé">
          <strong>Explore</strong>
          {footerLinks.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
        <div className="footer-action">
          <strong>Pronto para competir?</strong>
          <p>Envie seus dados e acompanhe o estado da sua inscrição.</p>
          <Link className="button button-primary button-compact" href="/inscricao">Fazer inscrição</Link>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© {new Date().getFullYear()} Blox Rank BR</span>
        <span>Projeto competitivo da comunidade brasileira.</span>
      </div>
    </footer>
  );
}
