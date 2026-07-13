import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { AppEnv } from "./config/env.js";
import { healthRoutes } from "./routes/health.js";
import { matchRoutes, type MatchOperations } from "./routes/matches.js";
import { registrationRoutes, type RegistrationOperations } from "./routes/registrations.js";
import { tournamentRoutes, type TournamentOperations } from "./routes/tournaments.js";
import { createAdminAuthHook } from "./utils/admin-auth.js";
import { configureErrorHandling } from "./utils/http-errors.js";

export interface AppOperations {
  registrations: RegistrationOperations;
  tournaments: TournamentOperations;
  matches: MatchOperations;
}

export interface BuildAppOptions {
  env: AppEnv;
  pool: Pool;
  operations: AppOperations;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { env, operations, pool } = options;
  const allowedOrigins = new Set(env.CORS_ORIGINS);

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.x-api-key",
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers.set-cookie",
        ],
        censor: "[REDACTED]",
      },
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 32 * 1024,
    requestIdHeader: false,
  });

  configureErrorHandling(app);

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, origin === undefined || allowedOrigins.has(origin));
    },
    credentials: false,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-API-Key", "X-Discord-User-Id"],
    maxAge: 600,
    strictPreflight: true,
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    keyGenerator: (request) => request.ip,
  });

  app.addHook("onSend", async (_request, reply) => {
    void reply.header("X-Content-Type-Options", "nosniff");
    void reply.header("X-Frame-Options", "DENY");
    void reply.header("Referrer-Policy", "no-referrer");
    void reply.header("Cache-Control", "no-store");
  });

  const requireAdmin = createAdminAuthHook(env.API_SECRET);

  await app.register(healthRoutes, { pool });
  await app.register(registrationRoutes, {
    registrations: operations.registrations,
    requireAdmin,
    registrationRateLimitMax: env.REGISTRATION_RATE_LIMIT_MAX,
  });
  await app.register(tournamentRoutes, {
    tournaments: operations.tournaments,
    requireAdmin,
  });
  await app.register(matchRoutes, {
    matches: operations.matches,
    requireAdmin,
  });

  await app.ready();
  return app;
}
