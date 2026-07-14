import type { Pool } from "pg";
import { withTransaction } from "../database/index.js";
import {
  AuditLogRepository,
  MatchRepository,
  OutboxRepository,
  RegistrationRepository,
  TournamentRepository,
} from "../repositories/index.js";
import type { Match } from "../types/domain.js";
import {
  determineWinner,
  getEliminationFinalPosition,
  getNextMatchPlacement,
} from "../utils/bracket.js";
import { ConflictError, NotFoundError } from "../utils/errors.js";
import type { MatchResultInput } from "../utils/schemas.js";
import { DISCORD_OUTBOX_EVENTS } from "./discord-events.js";

interface MatchServiceOptions {
  pool: Pool;
  matches: MatchRepository;
  registrations: RegistrationRepository;
  tournaments: TournamentRepository;
  auditLogs: AuditLogRepository;
  outbox: OutboxRepository;
  logsChannelId: string;
}

export interface RecordedMatchResult {
  match: Match;
  idempotent: boolean;
}

export class MatchService {
  public constructor(private readonly options: MatchServiceOptions) {}

  public async recordResult(
    id: string,
    input: MatchResultInput,
    actorDiscordId: string,
  ): Promise<RecordedMatchResult> {
    return withTransaction(this.options.pool, async (client) => {
      const match = await this.options.matches.getByIdForUpdate(id, client);
      if (match === null) {
        throw new NotFoundError("Partida não encontrada.");
      }
      if (match.status === "completed") {
        if (
          match.playerOneScore === input.player_one_score &&
          match.playerTwoScore === input.player_two_score
        ) {
          return { match, idempotent: true };
        }
        throw new ConflictError("Esta partida já possui outro resultado.");
      }
      if (match.status === "cancelled") {
        throw new ConflictError("Esta partida foi cancelada.");
      }
      if (match.playerOneRegistrationId === null || match.playerTwoRegistrationId === null) {
        throw new ConflictError("Esta partida ainda aguarda os dois jogadores.");
      }

      const tournament = await this.options.tournaments.getById(match.tournamentId, client);
      if (tournament?.status !== "active") {
        throw new ConflictError("O torneio não está ativo.");
      }

      const { winner, loser } = determineWinner(
        match.playerOneRegistrationId,
        match.playerTwoRegistrationId,
        input.player_one_score,
        input.player_two_score,
      );
      const completed = await this.options.matches.complete(
        id,
        {
          playerOneScore: input.player_one_score,
          playerTwoScore: input.player_two_score,
          winnerRegistrationId: winner,
        },
        client,
      );
      if (completed === null) {
        throw new ConflictError("Não foi possível registrar o resultado desta partida.");
      }

      const eliminated = await this.options.tournaments.setPlayerEliminated(
        match.tournamentId,
        loser,
        getEliminationFinalPosition(match.round),
        client,
      );
      if (eliminated === null) {
        throw new ConflictError("O jogador eliminado não pertence a este torneio.");
      }

      const nextPlacement = getNextMatchPlacement(match.round, match.bracketPosition);
      const winnerRegistration = await this.options.registrations.getById(winner, client);
      if (winnerRegistration === null) {
        throw new ConflictError("O vencedor não possui uma inscrição válida.");
      }
      if (nextPlacement === null) {
        const lockedTournament = await this.options.tournaments.getByIdForUpdate(
          match.tournamentId,
          client,
        );
        if (lockedTournament?.status !== "active") {
          throw new ConflictError("O torneio não está ativo.");
        }
        const champion = await this.options.tournaments.setChampion(
          match.tournamentId,
          winner,
          client,
        );
        if (champion === null) {
          throw new ConflictError("Não foi possível registrar o campeão.");
        }
        await this.options.tournaments.updateStatus(match.tournamentId, "finished", client);
      } else {
        const nextMatch = await this.options.matches.getByPositionForUpdate(
          match.tournamentId,
          nextPlacement.round,
          nextPlacement.bracketPosition,
          client,
        );
        if (nextMatch === null) {
          throw new ConflictError("A próxima partida não foi encontrada no chaveamento.");
        }
        const updatedNextMatch = await this.options.matches.setNextSlot(
          nextMatch.id,
          nextPlacement.slot === "player_one" ? "playerOne" : "playerTwo",
          winner,
          client,
        );
        if (updatedNextMatch === null) {
          throw new ConflictError("A próxima partida já possui outro jogador nesta vaga.");
        }
      }

      await this.options.auditLogs.create(
        {
          action: "match.result_recorded",
          actorDiscordId,
          targetId: completed.id,
          metadata: {
            tournamentId: completed.tournamentId,
            round: completed.round,
            bracketPosition: completed.bracketPosition,
            playerOneScore: input.player_one_score,
            playerTwoScore: input.player_two_score,
            winnerRegistrationId: winner,
          },
        },
        client,
      );
      await this.options.outbox.enqueue(
        {
          eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
          channelId: this.options.logsChannelId,
          deduplicationKey: `match.result_recorded:${completed.id}`,
          payload: {
            action: "match.result_recorded",
            actorDiscordId,
            targetId: completed.id,
            tournamentId: completed.tournamentId,
            round: completed.round,
            bracketPosition: completed.bracketPosition,
            playerOneScore: input.player_one_score,
            playerTwoScore: input.player_two_score,
            winnerRobloxUsername: winnerRegistration.robloxUsername,
            champion: nextPlacement === null,
          },
        },
        client,
      );

      return { match: completed, idempotent: false };
    });
  }
}
