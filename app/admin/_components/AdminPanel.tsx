"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";

type AdminSection = "dashboard" | "inscricoes" | "torneios" | "chaveamento" | "partidas" | "parceiros" | "configuracoes";
type RegistrationStatus = "pending" | "approved" | "rejected";
type Registration = {
  id: string;
  roblox_username: string;
  discord_username: string;
  level: number;
  bounty_honor: number;
  faction: "pirate" | "marine";
  platform: "pc" | "mobile" | "console";
  main_fruit: string;
  status: RegistrationStatus;
  rejection_reason: string | null;
};
type Tournament = { id: string; name: string; status: string; max_players: number };
type BracketPlayer = { registration_id: string; roblox_username: string; seed: number };
type Match = {
  id: string;
  round: number;
  bracket_position: number;
  player_one: BracketPlayer | null;
  player_two: BracketPlayer | null;
  player_one_score: number | null;
  player_two_score: number | null;
  winner: BracketPlayer | null;
  status: string;
};
type Bracket = { tournament: Tournament; matches: Match[] };

const nav: Array<{ section: AdminSection; label: string; href: string }> = [
  { section: "dashboard", label: "Visão geral", href: "/admin" },
  { section: "inscricoes", label: "Inscrições", href: "/admin/inscricoes" },
  { section: "torneios", label: "Torneio", href: "/admin/torneios" },
  { section: "chaveamento", label: "Chaveamento", href: "/admin/chaveamento" },
  { section: "partidas", label: "Partidas", href: "/admin/partidas" },
  { section: "parceiros", label: "Parceiros", href: "/admin/parceiros" },
  { section: "configuracoes", label: "Configurações", href: "/admin/configuracoes" },
];

const statusLabels: Record<string, string> = {
  draft: "Em preparação",
  registrations_open: "Inscrições abertas",
  registrations_closed: "Inscrições encerradas",
  active: "Em andamento",
  finished: "Finalizado",
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Recusada",
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function messageFrom(payload: unknown, fallback: string) {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return fallback;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null || !("message" in error)) return fallback;
  return typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message : fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (response.status === 401) {
    window.location.assign("/admin/login");
    throw new Error("Sessão expirada.");
  }
  if (!response.ok) throw new Error(messageFrom(payload, "Não foi possível concluir a ação."));
  if (payload === null) throw new Error("O servidor respondeu em formato inesperado.");
  return payload;
}

function unwrap<T>(payload: unknown): T {
  if (typeof payload === "object" && payload !== null && "data" in payload) return (payload as { data: T }).data;
  return payload as T;
}

function AdminFrame({ section, children, actorId }: { section: AdminSection; children: React.ReactNode; actorId?: string }) {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin/login");
  }

  const title = nav.find((item) => item.section === section)?.label ?? "Administração";
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/"><span className="admin-brand-mark" aria-hidden="true">BRB</span>Blox Rank BR</Link>
        <nav className="admin-nav" aria-label="Administração">
          {nav.map((item) => <a key={item.section} href={item.href} aria-current={item.section === section ? "page" : undefined}>{item.label}</a>)}
        </nav>
      </aside>
      <main className="admin-main">
        <div className="admin-topline">
          <div><p className="admin-eyebrow">Painel da organização</p><h1 className="admin-title">{title}</h1>{actorId && <p className="admin-muted">Ações registradas para o ID {actorId}</p>}</div>
          <button className="admin-button secondary" type="button" onClick={logout}>Sair</button>
        </div>
        {children}
      </main>
    </div>
  );
}

export function AdminPanel({ section }: { section: AdminSection }) {
  const [actorId, setActorId] = useState<string>();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    requestJson<unknown>("/api/admin/session")
      .then((payload) => {
        const session = unwrap<{ authenticated?: boolean; actor_discord_id?: string; actorDiscordId?: string }>(payload);
        if (session.authenticated !== true) {
          window.location.assign("/admin/login");
          return;
        }
        setActorId(session.actor_discord_id ?? session.actorDiscordId);
        setAuthReady(true);
      })
      .catch(() => {
        window.location.assign("/admin/login");
      });
  }, []);

  if (!authReady) return <main className="admin-login-page"><p className="admin-notice">Verificando acesso seguro…</p></main>;

  return (
    <AdminFrame section={section} actorId={actorId}>
      {section === "dashboard" && <Dashboard />}
      {section === "inscricoes" && <Registrations />}
      {section === "torneios" && <TournamentPanel />}
      {section === "chaveamento" && <BracketPanel allowResults={false} />}
      {section === "partidas" && <BracketPanel allowResults />}
      {section === "parceiros" && <UnavailablePanel title="Gestão de parceiros" text="A API atual ainda não oferece cadastro de parceiros. A página pública usa uma lista configurável no código e permanece vazia até que parceiros oficiais sejam adicionados." />}
      {section === "configuracoes" && <UnavailablePanel title="Configurações protegidas" text="Links públicos e credenciais são configurados no ambiente do servidor. Nenhum segredo é exibido ou alterado pelo navegador." />}
    </AdminFrame>
  );
}

function Dashboard() {
  const [tournament, setTournament] = useState<Tournament>();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [tournamentPayload, registrationsPayload] = await Promise.all([
        requestJson<unknown>("/api/admin/torneio"),
        requestJson<unknown>("/api/admin/inscricoes?limit=100&page=1"),
      ]);
      setTournament(unwrap<Tournament>(tournamentPayload));
      setRegistrations(unwrap<Registration[]>(registrationsPayload));
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Falha ao carregar."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const approved = registrations.filter((item) => item.status === "approved").length;
  const pending = registrations.filter((item) => item.status === "pending").length;
  if (error) return <ErrorState message={error} retry={load} />;
  if (!tournament) return <Loading />;
  return <div className="admin-grid">
    <article className="admin-card"><p className="admin-eyebrow">Torneio</p><h2>{tournament.name}</h2><span className="admin-status">{statusLabels[tournament.status] ?? tournament.status}</span></article>
    <article className="admin-card"><p className="admin-eyebrow">Aprovados</p><p className="admin-stat">{approved}/{tournament.max_players}</p></article>
    <article className="admin-card"><p className="admin-eyebrow">Aguardando análise</p><p className="admin-stat">{pending}</p></article>
  </div>;
}

function Registrations() {
  const [items, setItems] = useState<Registration[]>([]);
  const [filter, setFilter] = useState<"all" | RegistrationStatus>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState<Registration>();
  const query = filter === "all" ? "" : `&status=${filter}`;
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(unwrap<Registration[]>(await requestJson<unknown>(`/api/admin/inscricoes?page=1&limit=100${query}`))); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Falha ao carregar inscrições."); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function approve(id: string) {
    if (!window.confirm("Aprovar esta inscrição e solicitar o cargo de participante no Discord?")) return;
    try {
      await requestJson(`/api/admin/inscricoes/${encodeURIComponent(id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "approved" }) });
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Falha ao aprovar."); }
  }

  if (loading) return <Loading />;
  return <>
    <div className="admin-toolbar">
      <label className="admin-label">Situação<select className="admin-select" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="pending">Pendentes</option><option value="approved">Aprovadas</option><option value="rejected">Recusadas</option><option value="all">Todas</option></select></label>
      <button className="admin-button secondary" type="button" onClick={() => void load()}>Atualizar</button>
    </div>
    {error && <p className="admin-notice error" role="alert">{error}</p>}
    {items.length === 0 ? <Empty text="Nenhuma inscrição encontrada neste filtro." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Jogador</th><th>Discord</th><th>Dados</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.roblox_username}</strong><br/><span className="admin-muted">Nível {formatNumber(item.level)}</span></td><td>{item.discord_username}</td><td>{formatNumber(item.bounty_honor)} Bounty/Honor<br/><span className="admin-muted">{item.platform.toUpperCase()} · {item.faction === "pirate" ? "Pirata" : "Marinheiro"} · {item.main_fruit}</span></td><td><span className={`admin-status ${item.status}`}>{statusLabels[item.status]}</span>{item.rejection_reason && <p>{item.rejection_reason}</p>}</td><td><div className="admin-actions">{item.status === "pending" ? <><button className="admin-button" type="button" onClick={() => void approve(item.id)}>Aprovar</button><button className="admin-button danger" type="button" onClick={() => setRejecting(item)}>Recusar</button></> : <span className="admin-muted">Analisada</span>}</div></td></tr>)}</tbody></table></div>}
    {rejecting && <RejectModal registration={rejecting} close={() => setRejecting(undefined)} completed={async () => { setRejecting(undefined); await load(); }} />}
  </>;
}

function RejectModal({ registration, close, completed }: { registration: Registration; close(): void; completed(): Promise<void> }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    try {
      await requestJson(`/api/admin/inscricoes/${encodeURIComponent(registration.id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected", rejection_reason: reason }) });
      await completed();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Falha ao recusar."); }
    finally { setLoading(false); }
  }
  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="reject-title"><h2 id="reject-title">Recusar {registration.roblox_username}</h2><form className="admin-form" onSubmit={submit}><label className="admin-label">Motivo da recusa<textarea className="admin-textarea" name="reason" minLength={3} maxLength={500} required autoFocus /></label>{error && <p className="admin-notice error" role="alert">{error}</p>}<div className="admin-actions"><button className="admin-button danger" disabled={loading}>{loading ? "Registrando…" : "Confirmar recusa"}</button><button className="admin-button secondary" type="button" onClick={close}>Cancelar</button></div></form></section></div>;
}

function TournamentPanel() {
  const [tournament, setTournament] = useState<Tournament>();
  const [bracket, setBracket] = useState<Bracket>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const [a,b] = await Promise.all([requestJson<unknown>("/api/admin/torneio"), requestJson<unknown>("/api/admin/chaveamento")]); setTournament(unwrap<Tournament>(a)); setBracket(unwrap<Bracket>(b)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o torneio."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function generate() {
    if (!tournament || !window.confirm("Gerar o chaveamento agora? Esta ação exige exatamente 16 participantes aprovados e não pode ser repetida.")) return;
    try { await requestJson(`/api/admin/torneios/${encodeURIComponent(tournament.id)}/gerar-chaveamento`, { method: "POST" }); await load(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Falha ao gerar chaveamento."); }
  }
  if (loading) return <Loading />;
  if (error && !tournament) return <ErrorState message={error} retry={load} />;
  if (!tournament) return <Empty text="Nenhum torneio disponível." />;
  return <div className="admin-card"><p className="admin-eyebrow">Edição atual</p><h2>{tournament.name}</h2><p><span className="admin-status">{statusLabels[tournament.status] ?? tournament.status}</span></p><p className="admin-muted">Limite: {tournament.max_players} participantes</p>{error && <p className="admin-notice error">{error}</p>}<button className="admin-button" type="button" disabled={(bracket?.matches.length ?? 0) > 0} onClick={() => void generate()}>{(bracket?.matches.length ?? 0) > 0 ? "Chaveamento já gerado" : "Gerar chaveamento"}</button><p className="admin-muted">Abrir e fechar inscrições não está disponível na API REST atual e, por segurança, não foi simulado no site.</p></div>;
}

function BracketPanel({ allowResults }: { allowResults: boolean }) {
  const [bracket, setBracket] = useState<Bracket>();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Match>();
  const load = useCallback(async () => {
    setError("");
    try { setBracket(unwrap<Bracket>(await requestJson<unknown>("/api/admin/chaveamento"))); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Falha ao carregar chaveamento."); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const rounds = useMemo(() => {
    const map = new Map<number, Match[]>();
    bracket?.matches.forEach((match) => map.set(match.round, [...(map.get(match.round) ?? []), match]));
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [bracket]);
  if (error && !bracket) return <ErrorState message={error} retry={load} />;
  if (!bracket) return <Loading />;
  if (bracket.matches.length === 0) return <Empty text="O chaveamento ainda não foi criado." />;
  return <>{error && <p className="admin-notice error">{error}</p>}<div className="admin-rounds">{rounds.map(([round, matches]) => <section key={round}><h2>Rodada {round}</h2>{matches.map((match) => <article className="admin-match" key={match.id}><p><strong>{match.player_one?.roblox_username ?? "A definir"}</strong> {match.player_one_score ?? "–"}</p><p><strong>{match.player_two?.roblox_username ?? "A definir"}</strong> {match.player_two_score ?? "–"}</p><span className={`admin-status ${match.status}`}>{statusLabels[match.status] ?? match.status}</span>{allowResults && match.status !== "completed" && match.player_one && match.player_two && <p><button className="admin-button" type="button" onClick={() => setSelected(match)}>Registrar resultado</button></p>}</article>)}</section>)}</div>{selected && <ResultModal match={selected} close={() => setSelected(undefined)} completed={async () => { setSelected(undefined); await load(); }} />}</>;
}

function ResultModal({ match, close, completed }: { match: Match; close(): void; completed(): Promise<void> }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    try { await requestJson(`/api/admin/partidas/${encodeURIComponent(match.id)}/resultado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player_one_score: Number(form.get("player_one_score")), player_two_score: Number(form.get("player_two_score")) }) }); await completed(); }
    catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Falha ao registrar resultado."); }
    finally { setLoading(false); }
  }
  return <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><h2 id="result-title">Resultado da partida</h2><form className="admin-form" onSubmit={submit}><label className="admin-label">{match.player_one?.roblox_username}<input className="admin-input" name="player_one_score" type="number" min="0" max="100" required /></label><label className="admin-label">{match.player_two?.roblox_username}<input className="admin-input" name="player_two_score" type="number" min="0" max="100" required /></label>{error && <p className="admin-notice error" role="alert">{error}</p>}<div className="admin-actions"><button className="admin-button" disabled={loading}>{loading ? "Registrando…" : "Confirmar resultado"}</button><button className="admin-button secondary" type="button" onClick={close}>Cancelar</button></div></form></section></div>;
}

function Loading() { return <p className="admin-notice" role="status">Carregando dados oficiais…</p>; }
function Empty({ text }: { text: string }) { return <div className="admin-card"><h2>Nada por aqui</h2><p className="admin-muted">{text}</p></div>; }
function ErrorState({ message, retry }: { message: string; retry(): void | Promise<void> }) { return <div className="admin-card"><p className="admin-notice error" role="alert">{message}</p><button className="admin-button secondary" type="button" onClick={() => void retry()}>Tentar novamente</button></div>; }
function UnavailablePanel({ title, text }: { title: string; text: string }) { return <section className="admin-card"><h2>{title}</h2><p className="admin-muted">{text}</p></section>; }
