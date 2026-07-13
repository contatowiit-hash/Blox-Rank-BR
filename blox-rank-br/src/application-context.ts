import type { Pool } from "pg";
import type { AppOperations } from "./app.js";
import type { AppEnv } from "./config/env.js";
import {
  AuditLogRepository,
  MatchRepository,
  OutboxRepository,
  RegistrationRepository,
  TournamentRepository,
} from "./repositories/index.js";
import { MatchService, RegistrationService, TournamentService } from "./services/index.js";
import {
  serializeBracketMatch,
  serializeMatch,
  serializeRegistration,
  serializeTournament,
} from "./utils/serializers.js";

export function createApplicationContext(pool: Pool, env: AppEnv) {
  const repositories = {
    registrations: new RegistrationRepository(pool),
    tournaments: new TournamentRepository(pool),
    matches: new MatchRepository(pool),
    auditLogs: new AuditLogRepository(pool),
    outbox: new OutboxRepository(pool),
  };

  const services = {
    registrations: new RegistrationService({
      pool,
      registrations: repositories.registrations,
      tournaments: repositories.tournaments,
      auditLogs: repositories.auditLogs,
      outbox: repositories.outbox,
      registrationsChannelId: env.DISCORD_INSCRICOES_CHANNEL_ID,
      logsChannelId: env.DISCORD_LOGS_CHANNEL_ID,
      participantRoleId: env.DISCORD_PARTICIPANT_ROLE_ID,
    }),
    tournaments: new TournamentService({
      pool,
      registrations: repositories.registrations,
      tournaments: repositories.tournaments,
      matches: repositories.matches,
      auditLogs: repositories.auditLogs,
      outbox: repositories.outbox,
      logsChannelId: env.DISCORD_LOGS_CHANNEL_ID,
    }),
    matches: new MatchService({
      pool,
      matches: repositories.matches,
      tournaments: repositories.tournaments,
      auditLogs: repositories.auditLogs,
      outbox: repositories.outbox,
      logsChannelId: env.DISCORD_LOGS_CHANNEL_ID,
    }),
  };

  const apiOperations: AppOperations = {
    registrations: {
      async create(input) {
        return serializeRegistration(await services.registrations.create(input));
      },
      async list(query) {
        const result = await services.registrations.list(query);
        return { ...result, items: result.items.map(serializeRegistration) };
      },
      async getById(id) {
        return serializeRegistration(await services.registrations.getById(id));
      },
      async updateStatus(id, input, actorDiscordId) {
        return serializeRegistration(
          await services.registrations.updateStatus(id, input, actorDiscordId),
        );
      },
    },
    tournaments: {
      async getCurrent() {
        return serializeTournament(await services.tournaments.getCurrent());
      },
      async getCurrentBracket() {
        const bracket = await services.tournaments.getCurrentBracket();
        return {
          tournament: serializeTournament(bracket.tournament),
          matches: bracket.matches.map(serializeBracketMatch),
        };
      },
      async generateBracket(id, actorDiscordId) {
        const bracket = await services.tournaments.generateBracket(id, actorDiscordId);
        return {
          tournament: serializeTournament(bracket.tournament),
          matches: bracket.matches.map(serializeBracketMatch),
        };
      },
    },
    matches: {
      async recordResult(id, input, actorDiscordId) {
        const result = await services.matches.recordResult(id, input, actorDiscordId);
        return {
          ...serializeMatch(result.match),
          idempotent: result.idempotent,
        };
      },
    },
  };

  return { repositories, services, apiOperations };
}

export type ApplicationContext = ReturnType<typeof createApplicationContext>;
