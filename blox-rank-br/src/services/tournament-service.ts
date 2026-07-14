import type { Pool } from "pg";
import { withTransaction } from "../database/index.js";
import {
  AuditLogRepository,
  BracketAlreadyExistsError,
  MatchRepository,
  OutboxRepository,
  RegistrationRepository,
  TournamentRepository,
} from "../repositories/index.js";
import type { BracketMatch, CreateBracketMatchInput, Tournament } from "../types/domain.js";
import { buildFirstRoundPairs, TOURNAMENT_SIZE, TOTAL_ROUNDS } from "../utils/bracket.js";
import { ConflictError, NotFoundError, isPostgresError } from "../utils/errors.js";
import { DISCORD_OUTBOX_EVENTS } from "./discord-events.js";

interface TournamentServiceOptions {
  pool: Pool;
  registrations: RegistrationRepository;
  tournaments: TournamentRepository;
  matches: MatchRepository;
  auditLogs: AuditLogRepository;
  outbox: OutboxRepository;
  logsChannelId: string;
}

export interface BracketView {
  tournament: Tournament;
  matches: BracketMatch[];
}

export class TournamentService {
  public constructor(private readonly options: TournamentServiceOptions) {}

  public async getCurrent(): Promise<Tournament> {
    const tournament = await this.options.tournaments.getCurrent();
    if (tournament === null) {
      throw new NotFoundError("Nenhum torneio está disponível no momento.");
    }
    return tournament;
  }

  public async getById(id: string): Promise<Tournament> {
    const tournament = await this.options.tournaments.getById(id);
    if (tournament === null) {
      throw new NotFoundError("Torneio não encontrado.");
    }
    return tournament;
  }

  public async resolve(id?: string): Promise<Tournament> {
    return id === undefined ? this.getCurrent() : this.getById(id);
  }

  public async getCurrentBracket(): Promise<BracketView> {
    const tournament = await this.getCurrent();
    const matches = await this.options.matches.listBracket(tournament.id);
    return { tournament, matches };
  }

  public async getBracket(id?: string): Promise<BracketView> {
    const tournament = await this.resolve(id);
    return { tournament, matches: await this.options.matches.listBracket(tournament.id) };
  }

  public async setRegistrationsOpen(id: string, actorDiscordId: string): Promise<Tournament> {
    return withTransaction(this.options.pool, async (client) => {
      const tournament = await this.options.tournaments.getByIdForUpdate(id, client);
      if (tournament === null) throw new NotFoundError("Torneio não encontrado.");
      if (tournament.status === "registrations_open") return tournament;
      if (tournament.status !== "registrations_closed") {
        throw new ConflictError("Somente um torneio com inscrições encerradas pode ser reaberto.");
      }
      const updated = await this.options.tournaments.updateStatus(id, "registrations_open", client);
      if (updated === null) throw new ConflictError("Não foi possível abrir as inscrições.");
      const audit = await this.options.auditLogs.create({
        action: "tournament.registrations_reopened", actorDiscordId, targetId: id,
        metadata: { previousStatus: tournament.status, status: updated.status },
      }, client);
      await this.options.outbox.enqueue({
        eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
        channelId: this.options.logsChannelId,
        deduplicationKey: `tournament.registrations_reopened:${id}:${audit.id}`,
        payload: { action: "tournament.registrations_reopened", actorDiscordId, targetId: id, tournamentName: updated.name },
      }, client);
      return updated;
    });
  }

  public async setRegistrationsClosed(id: string, actorDiscordId: string): Promise<Tournament> {
    return withTransaction(this.options.pool, async (client) => {
      const tournament = await this.options.tournaments.getByIdForUpdate(id, client);
      if (tournament === null) throw new NotFoundError("Torneio não encontrado.");
      if (tournament.status === "registrations_closed") return tournament;
      if (tournament.status !== "registrations_open") {
        throw new ConflictError("Somente um torneio com inscrições abertas pode ser encerrado.");
      }
      const updated = await this.options.tournaments.updateStatus(id, "registrations_closed", client);
      if (updated === null) throw new ConflictError("Não foi possível encerrar as inscrições.");
      const audit = await this.options.auditLogs.create({
        action: "tournament.registrations_closed", actorDiscordId, targetId: id,
        metadata: { previousStatus: tournament.status, status: updated.status },
      }, client);
      await this.options.outbox.enqueue({
        eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
        channelId: this.options.logsChannelId,
        deduplicationKey: `tournament.registrations_closed:${id}:${audit.id}`,
        payload: { action: "tournament.registrations_closed", actorDiscordId, targetId: id, tournamentName: updated.name },
      }, client);
      return updated;
    });
  }

  public async generateBracket(id: string, actorDiscordId: string): Promise<BracketView> {
    try {
      const tournament = await withTransaction(this.options.pool, async (client) => {
        const lockedTournament = await this.options.tournaments.getByIdForUpdate(id, client);
        if (lockedTournament === null) {
          throw new NotFoundError("Torneio não encontrado.");
        }
        if (lockedTournament.status !== "registrations_closed") {
          throw new ConflictError("Feche as inscrições antes de gerar o chaveamento.");
        }
        if (lockedTournament.maxPlayers !== TOURNAMENT_SIZE) {
          throw new ConflictError("O torneio precisa estar configurado para 16 participantes.");
        }
        if (await this.options.matches.countByTournament(id, client)) {
          throw new ConflictError("O chaveamento deste torneio já foi gerado.");
        }

        const approvedCount = await this.options.registrations.countApproved(id, client);
        if (approvedCount !== TOURNAMENT_SIZE) {
          throw new ConflictError("É preciso ter exatamente 16 inscrições aprovadas.");
        }
        const approved = await this.options.registrations.listApprovedForUpdate(
          id,
          TOURNAMENT_SIZE,
          client,
        );
        if (approved.length !== TOURNAMENT_SIZE) {
          throw new ConflictError("É preciso ter exatamente 16 inscrições aprovadas.");
        }

        const seededPlayers = approved.map((registration, index) => ({
          registrationId: registration.id,
          seed: index + 1,
        }));
        await this.options.tournaments.addPlayers(id, seededPlayers, client);

        const firstRound = buildFirstRoundPairs(approved).map<CreateBracketMatchInput>((pair) => ({
          round: 1,
          bracketPosition: pair.bracketPosition,
          playerOneRegistrationId: pair.playerOne.player.id,
          playerTwoRegistrationId: pair.playerTwo.player.id,
          status: "pending",
        }));
        const laterRounds: CreateBracketMatchInput[] = [];
        for (let round = 2; round <= TOTAL_ROUNDS; round += 1) {
          const matchesInRound = 2 ** (TOTAL_ROUNDS - round);
          for (let bracketPosition = 1; bracketPosition <= matchesInRound; bracketPosition += 1) {
            laterRounds.push({ round, bracketPosition, status: "pending" });
          }
        }
        await this.options.matches.createBracket(id, [...firstRound, ...laterRounds], client);

        const activeTournament = await this.options.tournaments.updateStatus(id, "active", client);
        if (activeTournament === null) {
          throw new ConflictError("Não foi possível ativar o torneio.");
        }
        await this.options.auditLogs.create(
          {
            action: "tournament.bracket_generated",
            actorDiscordId,
            targetId: id,
            metadata: { players: TOURNAMENT_SIZE, matches: TOURNAMENT_SIZE - 1 },
          },
          client,
        );
        await this.options.outbox.enqueue(
          {
            eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
            channelId: this.options.logsChannelId,
            deduplicationKey: `tournament.bracket_generated:${id}`,
            payload: {
              action: "tournament.bracket_generated",
              actorDiscordId,
              targetId: id,
              tournamentName: activeTournament.name,
            },
          },
          client,
        );
        return activeTournament;
      });

      return {
        tournament,
        matches: await this.options.matches.listBracket(tournament.id),
      };
    } catch (error) {
      if (error instanceof BracketAlreadyExistsError || isPostgresError(error, "23505")) {
        throw new ConflictError("O chaveamento deste torneio já foi gerado.");
      }
      throw error;
    }
  }
}
