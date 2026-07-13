import type { FastifyPluginAsync } from "fastify";
import type { Pool, QueryConfig } from "pg";

export async function checkDatabaseHealth(pool: Pool): Promise<boolean> {
  try {
    const query = { text: "SELECT 1", query_timeout: 2_000 } as QueryConfig & {
      query_timeout: number;
    };
    await pool.query(query);
    return true;
  } catch {
    return false;
  }
}

interface HealthRoutesOptions {
  pool: Pool;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, options) => {
  app.get("/health", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const healthy = await checkDatabaseHealth(options.pool);
    if (!healthy) {
      request.log.warn(
        { event: "health_check_failed", errorName: "DatabaseUnavailable" },
        "Banco de dados indisponível no health check",
      );
      return reply.code(503).send({ status: "unavailable" });
    }
    return reply.code(200).send({ status: "ok" });
  });
};
