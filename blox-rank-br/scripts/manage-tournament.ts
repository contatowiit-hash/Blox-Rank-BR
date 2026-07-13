import { parseArgs } from "node:util";
import type { Pool } from "pg";
import { z } from "zod";
import { loadAppEnv } from "../src/config/env.js";
import { closeDatabasePool, createDatabasePool, withTransaction } from "../src/database/index.js";
import {
  AuditLogRepository,
  MatchRepository,
  OutboxRepository,
  TournamentRepository,
} from "../src/repositories/index.js";
import { DISCORD_OUTBOX_EVENTS } from "../src/services/discord-events.js";
import { parseWithSchema, ConflictError, NotFoundError } from "../src/utils/errors.js";
import { sanitizeErrorName, sanitizeText } from "../src/utils/sanitize.js";
import { discordIdSchema, uuidSchema } from "../src/utils/schemas.js";

const nameSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().min(3).max(120));

interface TournamentCommandContext {
  pool: Pool;
  logsChannelId: string;
  tournaments: TournamentRepository;
  matches: MatchRepository;
  auditLogs: AuditLogRepository;
  outbox: OutboxRepository;
}

async function createTournament(
  context: TournamentCommandContext,
  name: string,
  actorDiscordId: string,
): Promise<string> {
  return withTransaction(context.pool, async (client) => {
    const tournament = await context.tournaments.create(
      { name, maxPlayers: 16, status: "registrations_open" },
      client,
    );
    await context.auditLogs.create(
      {
        action: "tournament.created",
        actorDiscordId,
        targetId: tournament.id,
        metadata: { maxPlayers: 16, status: tournament.status },
      },
      client,
    );
    await context.outbox.enqueue(
      {
        eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
        channelId: context.logsChannelId,
        deduplicationKey: `tournament.created:${tournament.id}`,
        payload: {
          action: "tournament.created",
          actorDiscordId,
          targetId: tournament.id,
          tournamentName: tournament.name,
        },
      },
      client,
    );
    return tournament.id;
  });
}

async function closeRegistrations(
  context: TournamentCommandContext,
  id: string,
  actorDiscordId: string,
): Promise<string> {
  return withTransaction(context.pool, async (client) => {
    const tournament = await context.tournaments.getByIdForUpdate(id, client);
    if (tournament === null) {
      throw new NotFoundError("Torneio não encontrado.");
    }
    if (tournament.status !== "registrations_open") {
      throw new ConflictError("Somente um torneio com inscrições abertas pode ser fechado.");
    }
    const updated = await context.tournaments.updateStatus(id, "registrations_closed", client);
    if (updated === null) {
      throw new ConflictError("Não foi possível fechar as inscrições.");
    }
    const auditLog = await context.auditLogs.create(
      {
        action: "tournament.registrations_closed",
        actorDiscordId,
        targetId: id,
        metadata: { status: updated.status },
      },
      client,
    );
    await context.outbox.enqueue(
      {
        eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
        channelId: context.logsChannelId,
        deduplicationKey: `tournament.registrations_closed:${id}:${auditLog.id}`,
        payload: {
          action: "tournament.registrations_closed",
          actorDiscordId,
          targetId: id,
          tournamentName: updated.name,
        },
      },
      client,
    );
    return id;
  });
}

async function reopenRegistrations(
  context: TournamentCommandContext,
  id: string,
  actorDiscordId: string,
): Promise<string> {
  return withTransaction(context.pool, async (client) => {
    const tournament = await context.tournaments.getByIdForUpdate(id, client);
    if (tournament === null) {
      throw new NotFoundError("Torneio não encontrado.");
    }
    if (tournament.status !== "registrations_closed") {
      throw new ConflictError("Somente inscrições fechadas podem ser reabertas.");
    }
    if ((await context.matches.countByTournament(id, client)) !== 0) {
      throw new ConflictError("Não é possível reabrir após gerar o chaveamento.");
    }
    const updated = await context.tournaments.updateStatus(id, "registrations_open", client);
    if (updated === null) {
      throw new ConflictError("Não foi possível reabrir as inscrições.");
    }
    const auditLog = await context.auditLogs.create(
      {
        action: "tournament.registrations_reopened",
        actorDiscordId,
        targetId: id,
        metadata: { status: updated.status },
      },
      client,
    );
    await context.outbox.enqueue(
      {
        eventType: DISCORD_OUTBOX_EVENTS.administrativeAction,
        channelId: context.logsChannelId,
        deduplicationKey: `tournament.registrations_reopened:${id}:${auditLog.id}`,
        payload: {
          action: "tournament.registrations_reopened",
          actorDiscordId,
          targetId: id,
          tournamentName: updated.name,
        },
      },
      client,
    );
    return id;
  });
}

async function main(): Promise<void> {
  const env = loadAppEnv();
  const pool = createDatabasePool({
    databaseUrl: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
    poolMax: Math.min(env.DATABASE_POOL_MAX, 3),
    statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
    queryTimeoutMs: env.DATABASE_QUERY_TIMEOUT_MS,
    lockTimeoutMs: env.DATABASE_LOCK_TIMEOUT_MS,
    idleInTransactionSessionTimeoutMs: env.DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
    applicationName: "blox-rank-br-tournament-cli",
  });
  const context: TournamentCommandContext = {
    pool,
    logsChannelId: env.DISCORD_LOGS_CHANNEL_ID,
    tournaments: new TournamentRepository(pool),
    matches: new MatchRepository(pool),
    auditLogs: new AuditLogRepository(pool),
    outbox: new OutboxRepository(pool),
  };

  try {
    const command = process.argv[2];
    const { values } = parseArgs({
      args: process.argv.slice(3),
      options: {
        name: { type: "string" },
        id: { type: "string" },
        actor: { type: "string" },
      },
      strict: true,
    });
    const actorDiscordId = parseWithSchema(discordIdSchema, values.actor);

    let tournamentId: string;
    if (command === "create") {
      tournamentId = await createTournament(
        context,
        parseWithSchema(nameSchema, values.name),
        actorDiscordId,
      );
    } else if (command === "close") {
      tournamentId = await closeRegistrations(
        context,
        parseWithSchema(uuidSchema, values.id),
        actorDiscordId,
      );
    } else if (command === "reopen") {
      tournamentId = await reopenRegistrations(
        context,
        parseWithSchema(uuidSchema, values.id),
        actorDiscordId,
      );
    } else {
      throw new Error("Comando de torneio inválido.");
    }

    process.stdout.write(
      `${JSON.stringify({ level: "info", event: `tournament.${command}.completed`, tournamentId })}\n`,
    );
  } finally {
    await closeDatabasePool(pool);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      level: "error",
      event: "tournament.command.failed",
      errorType: sanitizeErrorName(error),
    })}\n`,
  );
  process.exitCode = 1;
}
