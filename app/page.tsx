"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  ArrowUpRight,
  Barcode,
  Blocks,
  CalendarDays,
  CircleDollarSign,
  CircleHelp,
  Copy,
  HandCoins,
  KeyRound,
  Pencil,
  RefreshCw,
  ScanLine,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  X,
} from "lucide-react";

type Profile = {
  name: string;
  balance: string;
};

type Shortcut = {
  label: string;
  icon: LucideIcon;
  badge?: string;
  opensPix?: boolean;
};

const STORAGE_KEY = "painel-financeiro-perfil-v1";
const DEFAULT_PROFILE: Profile = { name: "João Silva", balance: "10.000,00" };

const shortcuts: Shortcut[] = [
  { label: "Área Pix e Transferir", icon: Blocks, opensPix: true },
  { label: "Pagar", icon: Barcode },
  { label: "Pegar emprestado", icon: HandCoins, badge: "FGTS" },
  { label: "Recarga de celular", icon: Smartphone },
  { label: "Caixinha e Investir", icon: ShoppingBag },
];

const pixActions: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Transferir", icon: ArrowUpRight },
  { label: "Programar", icon: CalendarDays },
  { label: "Ler QR code", icon: ScanLine },
  { label: "Pix Copia e Cola", icon: Copy },
  { label: "Cobrar", icon: CircleDollarSign },
  { label: "Depositar", icon: ArrowDown },
];

const preferences: Array<{ label: string; icon: LucideIcon }> = [
  { label: "Pix automático", icon: RefreshCw },
  { label: "Registrar ou trazer chaves", icon: KeyRound },
  { label: "Meus limites", icon: SlidersHorizontal },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "JS";
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

function displayBalance(balance: string) {
  const value = balance.trim();
  return value.toLowerCase().startsWith("r$") ? value : `R$ ${value}`;
}

export default function Home() {
  const [view, setView] = useState<"home" | "pix">("home");
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [draft, setDraft] = useState<Profile>(DEFAULT_PROFILE);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let restoreTimer: number | undefined;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Profile>;
        if (typeof parsed.name === "string" && typeof parsed.balance === "string") {
          const next = { name: parsed.name.slice(0, 40), balance: parsed.balance.slice(0, 24) };
          restoreTimer = window.setTimeout(() => {
            setProfile(next);
            setDraft(next);
          }, 0);
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }

    const syncView = () => setView(window.location.hash === "#pix" ? "pix" : "home");
    syncView();
    window.addEventListener("popstate", syncView);
    return () => {
      window.removeEventListener("popstate", syncView);
      if (restoreTimer !== undefined) window.clearTimeout(restoreTimer);
    };
  }, []);

  useEffect(() => {
    if (!editing) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditing(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editing]);

  const avatar = useMemo(() => initials(profile.name), [profile.name]);
  const greetingName = useMemo(() => profile.name.trim().split(/\s+/)[0] || "Cliente", [profile.name]);

  function openPix() {
    window.history.pushState({}, "", "#pix");
    setView("pix");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closePix() {
    window.history.pushState({}, "", window.location.pathname);
    setView("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openEditor() {
    setDraft(profile);
    setError("");
    setEditing(true);
  }

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { name: draft.name.trim(), balance: draft.balance.trim() };
    if (!next.name || !next.balance) {
      setError("Preencha o nome e o saldo.");
      return;
    }
    const safeProfile = { name: next.name.slice(0, 40), balance: next.balance.slice(0, 24) };
    setProfile(safeProfile);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeProfile));
    setEditing(false);
  }

  if (view === "pix") {
    return (
      <main className="pix-page">
        <header className="pix-topbar">
          <button className="icon-button" type="button" aria-label="Voltar para o início" onClick={closePix}>
            <X aria-hidden="true" />
          </button>
          <button className="icon-button muted-button" type="button" aria-label="Ajuda">
            <CircleHelp aria-hidden="true" />
          </button>
        </header>

        <section className="pix-intro">
          <h1>Área Pix</h1>
          <p>Envie e receba pagamentos a qualquer hora e dia da semana, sem pagar nada por isso.</p>
        </section>

        <section className="pix-actions" aria-label="Opções Pix">
          {pixActions.map(({ label, icon: Icon }) => (
            <button className="pix-action inert-button" type="button" key={label} aria-label={label}>
              <span><Icon aria-hidden="true" /></span>
              <strong>{label}</strong>
            </button>
          ))}
        </section>

        <section className="pix-list" aria-labelledby="preferences-title">
          <h2 id="preferences-title">Preferências</h2>
          {preferences.map(({ label, icon: Icon }) => (
            <button className="pix-row inert-button" type="button" key={label}>
              <Icon aria-hidden="true" />
              <strong>{label}</strong>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </section>

        <section className="pix-list support-list" aria-labelledby="support-title">
          <h2 id="support-title">Suporte</h2>
          <button className="pix-row inert-button" type="button">
            <CircleHelp aria-hidden="true" />
            <strong>Preciso de ajuda</strong>
            <span aria-hidden="true">›</span>
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="home-page">
      <header className="home-header">
        <div className="avatar" aria-label={`Perfil de ${profile.name}`}>{avatar}</div>
        <button className="edit-profile" type="button" onClick={openEditor}>
          <Pencil aria-hidden="true" />
          Editar
        </button>
        <h1>Olá, {greetingName}</h1>
      </header>

      <section className="home-content" aria-label="Resumo da conta">
        <div className="account-balance">
          <h2>Saldo em conta</h2>
          <strong>{displayBalance(profile.balance)}</strong>
        </div>

        <button className="link-account inert-button" type="button">
          <span aria-hidden="true">+</span>
          Vincular conta
        </button>

        <section className="shortcuts" aria-label="Atalhos">
          {shortcuts.map(({ label, icon: Icon, badge, opensPix }) => (
            <button
              className={opensPix ? "shortcut-button" : "shortcut-button inert-button"}
              type="button"
              key={label}
              onClick={opensPix ? openPix : undefined}
            >
              <span className="shortcut-icon">
                <Icon aria-hidden="true" />
                {badge && <small>{badge}</small>}
              </span>
              <strong>{label}</strong>
            </button>
          ))}
        </section>

        <p className="demo-note">Demonstração visual — nenhum botão realiza operações financeiras.</p>
      </section>

      {editing && (
        <div className="editor-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditing(false);
        }}>
          <section className="editor-card" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <button className="editor-close" type="button" aria-label="Fechar edição" onClick={() => setEditing(false)}>
              <X aria-hidden="true" />
            </button>
            <h2 id="editor-title">Editar tela inicial</h2>
            <p>Essas mudanças ficam salvas somente neste navegador.</p>
            <form onSubmit={saveProfile}>
              <label>
                Seu nome
                <input
                  autoFocus
                  maxLength={40}
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ex.: João Silva"
                />
              </label>
              <label>
                Saldo exibido
                <span className="balance-input">
                  <span>R$</span>
                  <input
                    maxLength={24}
                    value={draft.balance.replace(/^R\$\s*/i, "")}
                    onChange={(event) => setDraft((current) => ({ ...current, balance: event.target.value }))}
                    placeholder="Ex.: 2,00"
                  />
                </span>
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="save-button" type="submit">Salvar mudanças</button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
