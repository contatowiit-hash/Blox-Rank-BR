"use client";

import { useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "./ApiState";
import {
  factionLabels,
  formatBounty,
  platformLabels,
  type PublicBracket,
  type PublicParticipant,
} from "./public-types";
import { usePublicResource } from "./use-public-resource";

export function ParticipantsGrid({ limit }: { limit?: number }) {
  const resource = usePublicResource<PublicParticipant[]>("/api/public/participantes");
  const bracket = usePublicResource<PublicBracket>("/api/public/chaveamento");
  const [query, setQuery] = useState("");
  const [faction, setFaction] = useState<"all" | PublicParticipant["faction"]>("all");
  const [platform, setPlatform] = useState<"all" | PublicParticipant["platform"]>("all");
  const [order, setOrder] = useState<"bounty" | "level" | "name">("bounty");
  const seeds = useMemo(() => {
    const result = new Map<string, number>();
    if (bracket.status !== "success") return result;
    for (const match of bracket.data.matches) {
      if (match.player_one) result.set(match.player_one.registration_id, match.player_one.seed);
      if (match.player_two) result.set(match.player_two.registration_id, match.player_two.seed);
    }
    return result;
  }, [bracket]);

  if (resource.status === "loading") return <LoadingState label="Montando a lista de participantes" />;
  if (resource.status === "error") return <ErrorState onRetry={resource.retry} />;
  if (resource.data.length === 0) {
    return <EmptyState title="Nenhum participante confirmado" message="As inscrições aprovadas aparecerão aqui." />;
  }

  const filteredParticipants = [...resource.data]
    .filter((participant) => participant.roblox_username.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")))
    .filter((participant) => faction === "all" || participant.faction === faction)
    .filter((participant) => platform === "all" || participant.platform === platform)
    .sort((left, right) => order === "name" ? left.roblox_username.localeCompare(right.roblox_username, "pt-BR") : order === "level" ? right.level - left.level : right.bounty_honor - left.bounty_honor);
  const participants = limit === undefined ? filteredParticipants : resource.data.slice(0, limit);
  return (
    <>
      {limit === undefined && <div className="participant-controls" aria-label="Filtrar participantes">
        <label className="participant-search"><span>Buscar jogador</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome no Roblox" /></label>
        <label><span>Facção</span><select value={faction} onChange={(event) => setFaction(event.target.value as typeof faction)}><option value="all">Todas</option><option value="pirate">Pirata</option><option value="marine">Marinheiro</option></select></label>
        <label><span>Plataforma</span><select value={platform} onChange={(event) => setPlatform(event.target.value as typeof platform)}><option value="all">Todas</option><option value="pc">PC</option><option value="mobile">Celular</option><option value="console">Console</option></select></label>
        <label><span>Ordenar por</span><select value={order} onChange={(event) => setOrder(event.target.value as typeof order)}><option value="bounty">Maior Bounty/Honor</option><option value="level">Maior nível</option><option value="name">Nome</option></select></label>
      </div>}
      {participants.length === 0 ? <EmptyState title="Nenhum jogador encontrado" message="Mude a busca ou os filtros para ver outros participantes." /> : <div className="participants-grid">
      {participants.map((participant, index) => (
        <article className="participant-card" key={participant.id}>
          <div className="participant-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
          <div className="participant-card-heading">
            <span className="participant-avatar" aria-hidden="true">{participant.roblox_username.slice(0, 2).toUpperCase()}</span>
            <div>
              <span>Jogador confirmado</span>
              <h2>{participant.roblox_username}</h2>
            </div>
          </div>
          {seeds.has(participant.id) && <span className="participant-seed">Seed #{seeds.get(participant.id)}</span>}
          <dl>
            <div><dt>Bounty/Honor</dt><dd>{formatBounty(participant.bounty_honor)}</dd></div>
            <div><dt>Nível</dt><dd>{formatBounty(participant.level)}</dd></div>
            <div><dt>Facção</dt><dd>{factionLabels[participant.faction]}</dd></div>
            <div><dt>Joga em</dt><dd>{platformLabels[participant.platform]}</dd></div>
          </dl>
          <div className="participant-fruit"><span>Fruta principal</span><strong>{participant.main_fruit}</strong></div>
        </article>
      ))}
      </div>}
    </>
  );
}
