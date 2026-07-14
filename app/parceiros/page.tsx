import type { Metadata } from "next";
import Image from "next/image";
import { EmptyState } from "../components/ApiState";
import { PageHero } from "../components/PageHero";
import { PublicShell } from "../components/PublicShell";
import { partners } from "../content/partners";

export const metadata: Metadata = { title: "Parceiros", description: "Parceiros oficialmente anunciados pelo Blox Rank BR.", alternates: { canonical: "/parceiros" } };

export default function PartnersPage() {
  return <PublicShell><PageHero eyebrow="Parceiros" title="Marcas que fortalecem a arena." description="Este espaço reúne apenas parcerias anunciadas oficialmente pelo Blox Rank BR." />
    <section className="section narrow-section">{partners.length === 0
      ? <EmptyState title="Nenhum parceiro anunciado" message="Quando uma parceria for confirmada pela organização, ela aparecerá aqui." />
      : <div className="partners-grid">{partners.map((partner) => <article className="partner-card" key={`${partner.platform}:${partner.handle}`}>
          {partner.photoPath
            ? <Image src={partner.photoPath} alt={`Foto de ${partner.name}`} width={112} height={112} />
            : <span className="partner-placeholder" aria-hidden="true">{partner.name.slice(0, 2).toUpperCase()}</span>}
          <div><span>{partner.platform}</span><h2>{partner.name}</h2><strong>{partner.handle}</strong><p>{partner.description}</p><a className="text-link" href={partner.url} target="_blank" rel="noopener noreferrer">Conhecer parceiro</a></div>
        </article>)}</div>}
    </section>
  </PublicShell>;
}
