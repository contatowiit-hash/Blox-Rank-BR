import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { createApplicationContext } from "./application-context.js";
import { startDiscordBot, type DiscordBotRuntime } from "./bot.js";
import { loadAppEnv } from "./config/env.js";
import { closeDatabasePool, createDatabasePool } from "./database/index.js";
import { checkDatabaseHealth } from "./routes/health.js";
import { sanitizeErrorName } from "./utils/sanitize.js";

async function main(): Promise<void> {
  const env = loadAppEnv();
  const pool = createDatabasePool({
    databaseUrl: env.DATABASE_URL,
    ssl: env.DATABASE_SSL,
    poolMax: env.DATABASE_POOL_MAX,
    statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
    queryTimeoutMs: env.DATABASE_QUERY_TIMEOUT_MS,
    lockTimeoutMs: env.DATABASE_LOCK_TIMEOUT_MS,
    idleInTransactionSessionTimeoutMs: env.DATABASE_IDLE_TRANSACTION_TIMEOUT_MS,
    applicationName: "blox-rank-br",
  });
  const context = createApplicationContext(pool, env);
  let app: FastifyInstance;
  try {
    app = await buildApp({ env, pool, operations: context.apiOperations });
  } catch (error) {
    await closeDatabasePool(pool);
    throw error;
  }
  let bot: DiscordBotRuntime | undefined;
  let botStartupPromise: Promise<DiscordBotRuntime> | undefined;
  let shutdownPromise: Promise<void> | undefined;

  const shutdown = (signal: string): Promise<void> => {
    if (shutdownPromise !== undefined) {
      return shutdownPromise;
    }
    shutdownPromise = (async () => {
      app.log.info({ event: "application.stopping", signal }, "Encerrando Blox Rank BR");
      if (bot === undefined && botStartupPromise !== undefined) {
        try {
          bot = await botStartupPromise;
        } catch {
          // A falha de inicialização já é registrada no fluxo principal.
        }
      }
      if (bot !== undefined) {
        try {
          await bot.stop();
        } catch (error) {
          app.log.warn(
            { event: "discord.stop_failed", errorName: sanitizeErrorName(error) },
            "O bot não encerrou normalmente",
          );
        }
      }
      try {
        await app.close();
      } catch (error) {
        app.log.warn(
          { event: "api.stop_failed", errorName: sanitizeErrorName(error) },
          "A API não encerrou normalmente",
        );
      }
      try {
        await closeDatabasePool(pool);
      } catch (error) {
        app.log.warn(
          { event: "database.stop_failed", errorName: sanitizeErrorName(error) },
          "O pool do banco não encerrou normalmente",
        );
      }
      app.log.info({ event: "application.stopped" }, "Blox Rank BR encerrado");
    })();
    return shutdownPromise;
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    if (shutdownPromise !== undefined) {
      await shutdownPromise;
      return;
    }
    botStartupPromise = startDiscordBot({
      env,
      context,
      healthCheck: async () => checkDatabaseHealth(pool),
      logger: {
        info: (fields, message) => app.log.info(fields, message),
        warn: (fields, message) => app.log.warn(fields, message),
        error: (fields, message) => app.log.error(fields, message),
      },
    });
    bot = await botStartupPromise;
    botStartupPromise = undefined;
    if (shutdownPromise !== undefined) {
      await shutdownPromise;
      return;
    }
    app.log.info({ event: "application.started" }, "API e bot do Blox Rank BR iniciados");
  } catch (error) {
    app.log.error(
      { event: "application.start_failed", errorName: sanitizeErrorName(error) },
      "Não foi possível iniciar o Blox Rank BR",
    );
    await shutdown("startup_failure");
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      level: "fatal",
      event: "application.fatal",
      errorName: sanitizeErrorName(error),
    })}\n`,
  );
  process.exitCode = 1;
});
