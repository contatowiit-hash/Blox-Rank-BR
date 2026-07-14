"use client";

import Link from "next/link";
import { ArrowRight, Swords, Trophy, Users } from "lucide-react";
import { ErrorState, LoadingState } from "./ApiState";
import { tournamentStatusLabels, type PublicParticipant, type PublicTournament } from "./public-types";
import { usePublicResource } from "./use-public-resource";

export function TournamentOverview({ compact = false }: { compact?: boolean }) {
  const resource = usePublicResource<PublicTournament>("/api/public/torneio");
  const participants = usePublicResource<PublicParticipant[]>("/api/public/participantes");

  if (resource.status === "loading") return <LoadingState label="Buscando o torneio atual" />;
  if (resource.status === "error") return <ErrorState onRetry={resource.retry} />;

  const tournament = resource.data;
  return (
    <article className={compact ? "tournament-card tournament-card-compact" : "tournament-card"}>
      <div className="tournament-card-top">
        <span className={`status-pill status-${tournament.status}`}>
          <span aria-hidden="true" />
          {tournamentStatusLabels[tournament.status]}
        </span>
        <span className="tournament-code">BRB // TORNEIO ATUAL</span>
      </div>
      <div className="tournament-card-body">
        <div>
          <span className="eyebrow">Competição comunitária</span>
          <h2>{tournament.name}</h2>
          <p>Mata-mata com os jogadores aprovados, organizado pela equipe do Blox Rank BR.</p>
        </div>
        <dl className="tournament-stats">
          <div><Users aria-hidden="true" /><dt>Aprovados</dt><dd>{participants.status === "success" ? `${participants.data.length}/${tournament.max_players}` : participants.status === "loading" ? "Carregando..." : "Aguardando atualização oficial."}</dd></div>
          <div><Swords aria-hidden="true" /><dt>Formato</dt><dd>Mata-mata</dd></div>
          <div><Trophy aria-hidden="true" /><dt>Estado</dt><dd>{tournamentStatusLabels[tournament.status]}</dd></div>
        </dl>
      </div>
      <div className="tournament-card-actions">
        {tournament.status === "registrations_open"
          ? <Link className="text-link" href="/inscricao">Fazer inscrição <ArrowRight aria-hidden="true" /></Link>
          : <span className="tournament-registration-state">Inscrições não estão abertas.</span>}
        <Link className="text-link" href="/chaveamento">Ver chaveamento <ArrowRight aria-hidden="true" /></Link>
        <Link className="text-link" href="/participantes">Ver participantes <ArrowRight aria-hidden="true" /></Link>
      </div>
    </article>
  );
}
