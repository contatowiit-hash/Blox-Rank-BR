import type { Pool } from "pg";
import { withTransaction } from "../database/index.js";
import {
  AuditLogRepository,
  OutboxRepository,
  RegistrationRepository,
  TournamentRepository,
} from "../repositories/index.js";
import type { Registration } from "../types/domain.js";
import { ConflictError, NotFoundError, isPostgresError } from "../utils/errors.js";
import type {
  CreateRegistrationInput,
  RegistrationListQuery,
  UpdateRegistrationStatusInput,
} from "../utils/schemas.js";
import { TOURNAMENT_SIZE } from "../utils/bracket.js";
import { DISCORD_OUTBOX_EVENTS } from "./discord-events.js";

interface RegistrationServiceOptions {
  pool: Pool;
  registrations: RegistrationRepository;
  tournaments: TournamentRepository;
  auditLogs: AuditLogRepository;
  outbox: OutboxRepository;
  registrationsChannelId: string;
  logsChannelId: string;
  participantRoleId: string;
}

export interface RegistrationPage {
  items: Registration[];
  total: number;
  page: number;
  limit: number;
}

export class RegistrationService {
  public constructor(private readonly options: RegistrationServiceOptions) {}

  public async create(input: CreateRegistrationInput): Promise<Registration> {
    try {
      return await withTransaction(this.options.pool, async (client) => {
        const current = await this.options.tournaments.getCurrent(client);
        if (current === null) {
          throw new ConflictError("As inscrições não estão abertas no momento.");
        }
        const lockedTournament = await this.options.tournaments.getByIdForUpdate(current.id, client);
        if (lockedTournament?.status !== "registrations_open") {
          throw new ConflictError("As inscrições não estão abertas no momento.");
        }

        const registration = await this.options.registrations.create(
          {
            tournamentId: lockedTournament.id,
            robloxUsername: input.roblox_username,
            discordUserId: input.discord_user_id,
            discordUsername: input.discord_username,
            level: input.level,
            bountyHonor: input.bounty_honor,
            faction: input.faction,
            platform: input.platform,
            mainFruit: input.main_fruit,
          },
          client,
        );

        await this.options.outbox.enqueue(
          {
            eventType: DISCORD_OUTBOX_EVENTS.registrationCreated,
            channelId: this.options.registrationsChannelId,
            deduplicationKey: `registration.created:${registration.id}`,
            payload: {
              registrationId: registration.id,
              tournamentId: lockedTournament.id,
              tournamentName: lockedTournament.name,
              robloxUsername: registration.robloxUsername,
              discordUserId: registration.discordUserId,
              discordUsername: registration.discordUsername,
              level: registration.level,
              bountyHonor: registration.bountyHonor,
              faction: registration.faction,
              platform: registration.platform,
              mainFruit: registration.mainFruit,
            },
          },
          client,
        );
        return registration;
      });
    } catch (error) {
      if (isPostgresError(error, "23505")) {
        throw new ConflictError("Já existe uma inscrição com este Discord ou nome do Roblox.");
      }
      throw error;
    }
  }

  public async list(query: RegistrationListQuery): Promise<RegistrationPage> {
    const tournamentId = query.tournament_id ?? (await this.options.tournaments.getCurrent())?.id;
    if (tournamentId === undefined) {
      throw new NotFoundError("Nenhum torneio está disponível no momento.");
    }
    const result = await this.options.registrations.list({
      tournamentId,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      ...(query.status === undefined ? {} : { status: query.status }),
    });
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }

  public async getById(id: string): Promise<Registration> {
    const registration = await this.options.registrations.getById(id);
    if (registration === null) {
      throw new NotFoundError("Inscrição não encontrada.");
    }
    return registration;
  }

  public async getPendingByDiscordUserId(discordUserId: string): Promise<Registration> {
    const tournament = await this.options.tournaments.getCurrent();
    if (tournament === null) {
      throw new NotFoundError("Nenhum torneio está disponível no momento.");
    }
    const registration = await this.options.registrations.getByDiscordUserId(
      tournament.id,
      discordUserId,
    );
    if (registration === null) {
      throw new NotFoundError("Este jogador não possui inscrição no torneio atual.");
    }
    if (registration.status !== "pending") {
      throw new ConflictError("A inscrição deste jogador já foi analisada.");
    }
    return registration;
  }

  public async updateStatus(
    id: string,
    input: UpdateRegistrationStatusInput,
    actorDiscordId: string,
  ): Promise<Registration> {
    return withTransaction(this.options.pool, async (client) => {
      const target = await this.options.registrations.getById(id, client);
      if (target === null) {
        throw new NotFoundError("Inscrição não encontrada.");
      }
      if (input.status === "approved" && target.status === "approved") {
        const auditLog = await this.options.auditLogs.create(
          {
            action: "registration.participant_role_retry_requested",
            actorDiscordId,
            targetId: target.id,
            metadata: { status: target.status },
          },
          client,
        );
        await this.options.outbox.enqueue(
          {
            eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
            channelId: this.options.logsChannelId,
            deduplicationKey: `registration.participant_role_retry_requested:${auditLog.id}`,
            payload: {
              action: "registration.participant_role_retry_requested",
              actorDiscordId,
              targetId: target.id,
              robloxUsername: target.robloxUsername,
            },
          },
          client,
        );
        await this.options.outbox.enqueue(
          {
            eventType: DISCORD_OUTBOX_EVENTS.participantRoleGrant,
            channelId: this.options.logsChannelId,
            deduplicationKey: `participant-role:${target.id}:retry:${auditLog.id}`,
            payload: {
              registrationId: target.id,
              discordUserId: target.discordUserId,
              roleId: this.options.participantRoleId,
            },
          },
          client,
        );
        return target;
      }
      if (target.status !== "pending") {
        throw new ConflictError("Esta inscrição já foi analisada e não pode ser alterada.");
      }
      if (input.status === "approved") {
        const lockedTournament = await this.options.tournaments.getByIdForUpdate(
          target.tournamentId,
          client,
        );
        if (
          lockedTournament === null ||
          !["registrations_open", "registrations_closed"].includes(lockedTournament.status)
        ) {
          throw new ConflictError("Este torneio não aceita novas aprovações.");
        }
        if (lockedTournament.maxPlayers !== TOURNAMENT_SIZE) {
          throw new ConflictError("O torneio precisa estar configurado para 16 participantes.");
        }
        const approvedCount = await this.options.registrations.countApproved(
          target.tournamentId,
          client,
        );
        if (approvedCount >= TOURNAMENT_SIZE) {
          throw new ConflictError("As 16 vagas do torneio já foram preenchidas.");
        }
      }

      const registration = await this.options.registrations.updateStatus(
        id,
        {
          status: input.status,
          actorDiscordId,
          rejectionReason: input.status === "rejected" ? input.rejection_reason : null,
        },
        client,
      );

      if (registration === null) {
        const currentRegistration = await this.options.registrations.getById(id, client);
        if (currentRegistration === null) {
          throw new NotFoundError("Inscrição não encontrada.");
        }
        throw new ConflictError("Esta inscrição já foi analisada e não pode ser alterada.");
      }

      const action = input.status === "approved" ? "registration.approved" : "registration.rejected";
      await this.options.auditLogs.create(
        {
          action,
          actorDiscordId,
          targetId: registration.id,
          metadata: { status: registration.status },
        },
        client,
      );

      await this.options.outbox.enqueue(
        {
          eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
          channelId: this.options.logsChannelId,
          deduplicationKey: `${action}:${registration.id}`,
          payload: {
            action,
            actorDiscordId,
            targetId: registration.id,
            robloxUsername: registration.robloxUsername,
            ...(registration.rejectionReason === null
              ? {}
              : { rejectionReason: registration.rejectionReason }),
          },
        },
        client,
      );

      if (input.status === "approved") {
        await this.options.outbox.enqueue(
          {
            eventType: DISCORD_OUTBOX_EVENTS.participantRoleGrant,
            channelId: this.options.logsChannelId,
            deduplicationKey: `participant-role:${registration.id}`,
            payload: {
              registrationId: registration.id,
              discordUserId: registration.discordUserId,
              roleId: this.options.participantRoleId,
            },
          },
          client,
        );
      }

      return registration;
    });
  }
}
