"use client";

import { useState } from "react";

const shortcuts = [
  { icon: "◇", label: "Área Pix e\nTransferir" },
  { icon: "▥", label: "Pagar" },
  { icon: "▱", label: "Pagar\nemprestado", badge: "FGTS" },
  { icon: "▯", label: "Recarga de\ncelular" },
  { icon: "▰", label: "Caixinhas e\nInvestir" },
];

const discoveries = [
  { theme: "family", title: "Seguro Vida", text: "Cuide de quem você ama de um jeito simples e que cabe no seu bolso.", action: "Conhecer" },
  { theme: "shield", title: "Área de Seguros do Nu", text: "Toda proteção para você e para quem você ama num só lugar.", action: "Conhecer" },
  { theme: "friends", title: "Indique o Nu para Amigos", text: "Espalhe como é simples estar no controle.", action: "Indicar amigos" },
  { theme: "phone", title: "Traga seus dados", text: "Mais chances de limites e produtos com a sua cara.", action: "Saiba mais" },
  { theme: "travel", title: "Chegou NuCel", text: "A experiência Nubank, agora em planos de celular.", action: "Conhecer" },
  { theme: "building", title: "Termos de uso", text: "Explicamos o que diz esse documento do Nubank.", action: "Conhecer" },
];

export default function Home() {
  const [visible, setVisible] = useState(true);
  const [notice, setNotice] = useState("");

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2200);
  }

  const money = (value: string) => (visible ? value : "••••••");

  return (
    <main>
      <header className="topbar">
        <button className="avatar" aria-label="Abrir perfil" onClick={() => notify("Perfil aberto")}>JS</button>
        <div className="top-actions">
          <button aria-label={visible ? "Ocultar valores" : "Mostrar valores"} onClick={() => setVisible((v) => !v)}>{visible ? "◉" : "○"}</button>
          <button aria-label="Ajuda" onClick={() => notify("Central de ajuda")}>?</button>
          <button aria-label="Segurança" onClick={() => notify("Tudo certo com sua conta")}>✓</button>
        </div>
        <h1>Olá, João</h1>
      </header>

      <div className="content">
        <button className="account-summary" onClick={() => notify("Detalhes da conta")}> 
          <span><strong>Saldo em conta</strong><b>{money("R$ 10.000,00")}</b></span><i>›</i>
        </button>
        <button className="link-account" onClick={() => notify("Vamos vincular outra conta")}>＋ <span>Vincular conta</span></button>

        <section className="shortcuts" aria-label="Atalhos">
          {shortcuts.map((item) => (
            <button key={item.label} onClick={() => notify(item.label.replace("\n", " "))}>
              <span className="shortcut-icon">{item.icon}{item.badge && <small>{item.badge}</small>}</span>
              <span>{item.label.split("\n").map((line) => <span key={line}>{line}</span>)}</span>
            </button>
          ))}
        </section>

        <button className="wide-card" onClick={() => notify("Seus cartões")}>▯ <strong>Meus cartões</strong><i>›</i></button>

        <button className="promo-card" onClick={() => notify("Conheça a portabilidade")}>Facilite seus planos para o futuro: <b>traga todo seu dinheiro para cá.</b><span className="dots">● ● <em>●</em></span></button>

        <section className="financial-list" aria-label="Produtos financeiros">
          <button onClick={() => notify("Cartão de crédito")}>
            <span><strong>Cartão de crédito</strong><small>Fatura atual</small><b>{money("R$ 0,00")}</b><small>Limite disponível: {money("R$ 5.000,00")}</small></span><i>›</i>
          </button>
          <button onClick={() => notify("Empréstimos")}>
            <span><strong>Empréstimo</strong><small>Valor disponível de até</small><b>{money("R$ 50.000,00")}</b></span><i>›</i>
          </button>
          <button onClick={() => notify("Seguro de vida")}>
            <span><strong>Seguro de vida</strong><small>Conheça Nubank Vida: um seguro simples e que cabe no bolso.</small></span><i>›</i>
          </button>
        </section>

        <section className="discover">
          <h2>Descubra mais</h2>
          <div className="card-row">
            {discoveries.map((card) => (
              <article key={card.title}>
                <div className={`card-art ${card.theme}`} aria-hidden="true"><span></span></div>
                <div className="card-copy">
                  <h3>{card.title}</h3><p>{card.text}</p>
                  <button onClick={() => notify(card.action)}>{card.action}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <button className="active" aria-label="Início">⌂</button><button aria-label="Conta">$</button><button aria-label="Produtos">▱</button><button aria-label="Celular">▯</button>
      </nav>
      {notice && <div className="toast" role="status">{notice}</div>}
    </main>
  );
}
