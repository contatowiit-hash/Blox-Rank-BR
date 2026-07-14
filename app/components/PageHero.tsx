import type { ReactNode } from "react";

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="page-hero">
      <div className="page-hero-grid" aria-hidden="true" />
      <div className="page-hero-content">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
      <div className="hero-rank-mark" aria-hidden="true">
        <span>BR</span>
        <strong>RANK</strong>
      </div>
    </section>
  );
}
