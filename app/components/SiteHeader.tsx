"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Brand } from "./Brand";
import { DiscordButton } from "./DiscordButton";

const links = [
  { href: "/", label: "Início" },
  { href: "/como-funciona", label: "Como funciona" },
  { href: "/torneio", label: "Torneio" },
  { href: "/chaveamento", label: "Chaveamento" },
  { href: "/participantes", label: "Participantes" },
  { href: "/regras", label: "Regras" },
  { href: "/parceiros", label: "Parceiros" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Brand />
        <button
          className="menu-toggle"
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="public-navigation"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
        <nav
          className={open ? "site-nav site-nav-open" : "site-nav"}
          id="public-navigation"
          aria-label="Navegação principal"
        >
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}>
                {link.label}
              </Link>
            );
          })}
          <DiscordButton />
          <Link className="nav-register" href="/inscricao" onClick={() => setOpen(false)}>Inscrever-se</Link>
        </nav>
      </div>
    </header>
  );
}
