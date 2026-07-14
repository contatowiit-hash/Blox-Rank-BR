"use client";

import { Check, Clock3, Trophy } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "./ApiState";
import type { BracketMatch, BracketPlayer, PublicBracket } from "./public-types";
import { usePublicResource } from "./use-public-resource";

const roundLabels: Record<number, string> = { 1: "Oitavas", 2: "Quartas", 3: "Semifinais", 4: "Final" };
const matchStatusLabels: Record<BracketMatch["status"], string> = {
  pending: "Aguardando",
  scheduled: "Agendada",
  completed: "Finalizada",
  cancelled: "Cancelada",
};

function PlayerRow({ player, score, winner }: { player: BracketPlayer | null; score: number | null; winner: boolean }) {
  return (
    <div className={winner ? "bracket-player bracket-winner" : "bracket-player"}>
      <span className="player-seed">{player ? `#${player.seed}` : "—"}</span>
      <strong>{player?.roblox_username ?? "A definir"}</strong>
      {winner && <Check aria-label="Vencedor" />}
      <span className="player-score">{score ?? "—"}</span>
    </div>
  );
}

function MatchCard({ match }: { match: BracketMatch }) {
  return (
    <article className={`bracket-match match-${match.status}`}>
      <header>
        <span>Partida {match.bracket_position}</span>
        <span>{match.status === "completed" ? matchStatusLabels[match.status] : <><Clock3 aria-hidden="true" /> {matchStatusLabels[match.status]}</>}</span>
      </header>
      <PlayerRow player={match.player_one} score={match.player_one_score} winner={match.winner?.registration_id === match.player_one?.registration_id} />
      <PlayerRow player={match.player_two} score={match.player_two_score} winner={match.winner?.registration_id === match.player_two?.registration_id} />
    </article>
  );
}

export function BracketBoard() {
  const resource = usePublicResource<PublicBracket>("/api/public/chaveamento");

  if (resource.status === "loading") return <LoadingState label="Carregando o chaveamento" />;
  if (resource.status === "error") return <ErrorState onRetry={resource.retry} />;
  if (resource.data.matches.length === 0) {
    return <EmptyState title="Chaveamento ainda não gerado" message="O chaveamento será publicado após o encerramento das inscrições." />;
  }

  const champion = resource.data.matches.find((match) => match.round === 4)?.winner ?? null;

  return (
    <section className="bracket-shell" aria-label={`Chaveamento de ${resource.data.tournament.name}`}>
      <div className="bracket-tournament-label">
        <span>Chave atual</span>
        <strong>{resource.data.tournament.name}</strong>
      </div>
      <div className="bracket-scroll" tabIndex={0} aria-label="Role horizontalmente para ver todas as rodadas">
        {[1, 2, 3, 4].map((round) => {
          const matches = resource.data.matches
            .filter((match) => match.round === round)
            .sort((left, right) => left.bracket_position - right.bracket_position);
          return (
            <section className={`bracket-round bracket-round-${round}`} key={round} aria-labelledby={`round-${round}`}>
              <header className="round-heading">
                <span>Rodada {round}</span>
                <h2 id={`round-${round}`}>{roundLabels[round]}</h2>
              </header>
              <div className="round-matches">
                {matches.map((match) => <MatchCard key={match.id} match={match} />)}
              </div>
            </section>
          );
        })}
      </div>
      {champion && <div className="bracket-champion" role="status"><Trophy aria-hidden="true" /><span>Campeão</span><strong>{champion.roblox_username}</strong><small>Seed #{champion.seed}</small></div>}
    </section>
  );
}
