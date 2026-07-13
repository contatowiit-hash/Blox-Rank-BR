import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, type AppOperations } from "../src/app.js";
import type { AppEnv } from "../src/config/env.js";

const API_SECRET = "test-only-api-secret-with-at-least-32-characters";
const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const ACTOR_DISCORD_ID = "123456789012345678";

const testEnv: AppEnv = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3_000,
  LOG_LEVEL: "silent",
  TRUST_PROXY: false,
  DATABASE_URL: "postgresql://user:password@localhost:5432/blox_rank_test",
  DATABASE_SSL: false,
  DATABASE_POOL_MAX: 1,
  DATABASE_STATEMENT_TIMEOUT_MS: 15_000,
  DATABASE_QUERY_TIMEOUT_MS: 20_000,
  DATABASE_LOCK_TIMEOUT_MS: 5_000,
  DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: 30_000,
  API_SECRET,
  CORS_ORIGINS: ["https://app.example.com"],
  RATE_LIMIT_MAX: 1_000,
  RATE_LIMIT_WINDOW: "1 minute",
  REGISTRATION_RATE_LIMIT_MAX: 100,
  OUTBOX_POLL_INTERVAL_MS: 1_000,
  DISCORD_BOT_TOKEN: "test-only-discord-token-that-is-never-used",
  DISCORD_APPLICATION_ID: ACTOR_DISCORD_ID,
  DISCORD_GUILD_ID: ACTOR_DISCORD_ID,
  DISCORD_STAFF_ROLE_ID: ACTOR_DISCORD_ID,
  DISCORD_PARTICIPANT_ROLE_ID: ACTOR_DISCORD_ID,
  DISCORD_INSCRICOES_CHANNEL_ID: ACTOR_DISCORD_ID,
  DISCORD_LOGS_CHANNEL_ID: ACTOR_DISCORD_ID,
};

const validRegistration = {
  roblox_username: "Jogador_BR",
  discord_user_id: "987654321098765432",
  discord_username: "Jogador Legal",
  level: 2_550,
  bounty_honor: 30_000_000,
  faction: "pirate",
  platform: "pc",
  main_fruit: "Dragon",
} as const;

interface OperationOverrides {
  registrations?: Partial<AppOperations["registrations"]>;
  tournaments?: Partial<AppOperations["tournaments"]>;
  matches?: Partial<AppOperations["matches"]>;
}

function createFakeOperations(overrides: OperationOverrides = {}): AppOperations {
  const defaults: AppOperations = {
    registrations: {
      create: vi.fn(async (input) => ({ id: VALID_UUID, ...input, status: "pending" })),
      list: vi.fn(async (query) => ({
        items: [],
        total: 0,
        page: query.page,
        limit: query.limit,
      })),
      getById: vi.fn(async (id) => ({ id })),
      updateStatus: vi.fn(async (id, input, actorDiscordId) => ({
        id,
        ...input,
        actorDiscordId,
      })),
    },
    tournaments: {
      getCurrent: vi.fn(async () => ({ id: VALID_UUID, name: "Blox Rank BR" })),
      getCurrentBracket: vi.fn(async () => ({ tournament_id: VALID_UUID, rounds: [] })),
      generateBracket: vi.fn(async (id, actorDiscordId) => ({ id, actorDiscordId })),
    },
    matches: {
      recordResult: vi.fn(async (id, input, actorDiscordId) => ({ id, ...input, actorDiscordId })),
    },
  };

  return {
    registrations: { ...defaults.registrations, ...overrides.registrations },
    tournaments: { ...defaults.tournaments, ...overrides.tournaments },
    matches: { ...defaults.matches, ...overrides.matches },
  };
}

function createFakePool(healthy = true): Pool {
  return {
    query: vi.fn(async () => {
      if (!healthy) {
        throw new Error("database unavailable in test");
      }
      return { rows: [{ one: 1 }], rowCount: 1 };
    }),
  } as unknown as Pool;
}

const openApps: FastifyInstance[] = [];

async function createTestApp(
  options: { operations?: AppOperations; pool?: Pool; env?: AppEnv } = {},
) {
  const operations = options.operations ?? createFakeOperations();
  const app = await buildApp({
    env: options.env ?? testEnv,
    operations,
    pool: options.pool ?? createFakePool(),
  });
  openApps.push(app);
  return { app, operations };
}

afterEach(async () => {
  const apps = openApps.splice(0);
  await Promise.all(apps.map(async (app) => app.close()));
});

describe("contratos HTTP da API", () => {
  it("permite criar inscri\u00e7\u00e3o e consultar torneio e chaveamento sem chave administrativa", async () => {
    const { app, operations } = await createTestApp();

    const registrationResponse = await app.inject({
      method: "POST",
      url: "/api/inscricoes",
      payload: validRegistration,
    });
    const tournamentResponse = await app.inject({ method: "GET", url: "/api/torneios/atual" });
    const bracketResponse = await app.inject({
      method: "GET",
      url: "/api/torneios/atual/chaveamento",
    });

    expect(registrationResponse.statusCode).toBe(201);
    expect(tournamentResponse.statusCode).toBe(200);
    expect(bracketResponse.statusCode).toBe(200);
    expect(operations.registrations.create).toHaveBeenCalledTimes(1);
    expect(operations.tournaments.getCurrent).toHaveBeenCalledTimes(1);
    expect(operations.tournaments.getCurrentBracket).toHaveBeenCalledTimes(1);
  });

  it("protege a listagem de inscri\u00e7\u00f5es e aceita somente a chave correta", async () => {
    const { app, operations } = await createTestApp();

    const missingKeyResponse = await app.inject({ method: "GET", url: "/api/inscricoes" });
    const wrongKeyResponse = await app.inject({
      method: "GET",
      url: "/api/inscricoes",
      headers: { "x-api-key": "wrong-key" },
    });
    const validKeyResponse = await app.inject({
      method: "GET",
      url: "/api/inscricoes",
      headers: { "x-api-key": API_SECRET },
    });

    expect(missingKeyResponse.statusCode).toBe(401);
    expect(wrongKeyResponse.statusCode).toBe(401);
    expect(validKeyResponse.statusCode).toBe(200);
    expect(validKeyResponse.json()).toMatchObject({
      data: [],
      pagination: { page: 1, limit: 25, total: 0, total_pages: 0 },
    });
    expect(operations.registrations.list).toHaveBeenCalledTimes(1);
  });

  it("libera somente origens CORS exatas e limita a criação pública", async () => {
    const { app } = await createTestApp({
      env: { ...testEnv, REGISTRATION_RATE_LIMIT_MAX: 1 },
    });
    const allowed = await app.inject({
      method: "POST",
      url: "/api/inscricoes",
      headers: { origin: "https://app.example.com" },
      payload: validRegistration,
    });
    const limited = await app.inject({
      method: "POST",
      url: "/api/inscricoes",
      headers: { origin: "https://app.example.com" },
      payload: validRegistration,
    });
    const disallowedPreflight = await app.inject({
      method: "OPTIONS",
      url: "/api/inscricoes",
      headers: {
        origin: "https://app.example.com.attacker.invalid",
        "access-control-request-method": "POST",
      },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
    expect(disallowedPreflight.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("exige o ator no PATCH e encaminha um Discord ID v\u00e1lido para a opera\u00e7\u00e3o", async () => {
    const { app, operations } = await createTestApp();
    const request = {
      method: "PATCH" as const,
      url: `/api/inscricoes/${VALID_UUID}/status`,
      payload: { status: "approved" },
    };

    const missingActorResponse = await app.inject({
      ...request,
      headers: { "x-api-key": API_SECRET },
    });
    const validActorResponse = await app.inject({
      ...request,
      headers: {
        "x-api-key": API_SECRET,
        "x-discord-user-id": ACTOR_DISCORD_ID,
      },
    });

    expect(missingActorResponse.statusCode).toBe(400);
    expect(missingActorResponse.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        issues: [{ field: "x-discord-user-id" }],
      },
    });
    expect(validActorResponse.statusCode).toBe(200);
    expect(operations.registrations.updateStatus).toHaveBeenCalledTimes(1);
    expect(operations.registrations.updateStatus).toHaveBeenCalledWith(
      VALID_UUID,
      { status: "approved" },
      ACTOR_DISCORD_ID,
    );
  });

  it("rejeita corpo inv\u00e1lido e UUID inv\u00e1lido antes de chamar as opera\u00e7\u00f5es", async () => {
    const { app, operations } = await createTestApp();

    const invalidBodyResponse = await app.inject({
      method: "POST",
      url: "/api/inscricoes",
      payload: { ...validRegistration, discord_user_id: "123" },
    });
    const invalidUuidResponse = await app.inject({
      method: "GET",
      url: "/api/inscricoes/not-a-uuid",
      headers: { "x-api-key": API_SECRET },
    });

    expect(invalidBodyResponse.statusCode).toBe(400);
    expect(invalidUuidResponse.statusCode).toBe(400);
    expect(invalidBodyResponse.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(invalidUuidResponse.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(operations.registrations.create).not.toHaveBeenCalled();
    expect(operations.registrations.getById).not.toHaveBeenCalled();
  });

  it("trata JSON malformado como erro do cliente sem expor detalhes internos", async () => {
    const { app, operations } = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/inscricoes",
      headers: { "content-type": "application/json" },
      payload: '{"roblox_username":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
    expect(operations.registrations.create).not.toHaveBeenCalled();
  });

  it("retorna health 200 com pool saud\u00e1vel e 503 quando a consulta falha", async () => {
    const healthy = await createTestApp({ pool: createFakePool(true) });
    const unhealthy = await createTestApp({ pool: createFakePool(false) });

    const healthyResponse = await healthy.app.inject({ method: "GET", url: "/health" });
    const unhealthyResponse = await unhealthy.app.inject({ method: "GET", url: "/health" });

    expect(healthyResponse.statusCode).toBe(200);
    expect(healthyResponse.json()).toEqual({ status: "ok" });
    expect(unhealthyResponse.statusCode).toBe(503);
    expect(unhealthyResponse.json()).toEqual({ status: "unavailable" });
  });

  it("n\u00e3o inclui o API_SECRET na resposta de erro inesperado", async () => {
    const operations = createFakeOperations({
      registrations: {
        create: vi.fn(async () => {
          throw new Error(`erro interno contendo ${API_SECRET}`);
        }),
      },
    });
    const { app } = await createTestApp({ operations });

    const response = await app.inject({
      method: "POST",
      url: "/api/inscricoes",
      payload: validRegistration,
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(API_SECRET);
    expect(response.json()).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
        message: expect.any(String),
        requestId: expect.any(String),
      },
    });
  });
});
