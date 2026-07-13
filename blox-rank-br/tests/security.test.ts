import { describe, expect, it } from "vitest";
import { loadAppEnv, loadDatabaseMigrationEnv } from "../src/config/env.js";
import { createDatabasePool } from "../src/database/pool.js";
import { isApiKeyValid } from "../src/utils/api-key.js";

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:password@localhost:5432/blox_rank_test",
  DATABASE_SSL: "false",
  API_SECRET: "a-secure-random-value-with-more-than-32-characters",
  CORS_ORIGINS: "https://app.example.com,http://localhost:5173",
  DISCORD_BOT_TOKEN: "a-valid-looking-discord-token-for-tests-only",
  DISCORD_APPLICATION_ID: "123456789012345678",
  DISCORD_GUILD_ID: "123456789012345678",
  DISCORD_STAFF_ROLE_ID: "123456789012345678",
  DISCORD_PARTICIPANT_ROLE_ID: "123456789012345678",
  DISCORD_INSCRICOES_CHANNEL_ID: "123456789012345678",
  DISCORD_LOGS_CHANNEL_ID: "123456789012345678",
};

describe("controles de segurança", () => {
  it("compara a chave administrativa sem aceitar tipos ou valores diferentes", () => {
    const secret = validEnvironment.API_SECRET!;
    expect(isApiKeyValid(secret, secret)).toBe(true);
    expect(isApiKeyValid(`${secret}x`, secret)).toBe(false);
    expect(isApiKeyValid(undefined, secret)).toBe(false);
    expect(isApiKeyValid([secret], secret)).toBe(false);
  });

  it("normaliza apenas origens CORS exatas", () => {
    const env = loadAppEnv(validEnvironment);
    expect(env.CORS_ORIGINS).toEqual(["https://app.example.com", "http://localhost:5173"]);
    expect(() => loadAppEnv({ ...validEnvironment, CORS_ORIGINS: "https://example.com/path" })).toThrow(
      "CORS_ORIGINS",
    );
  });

  it("não permite confiar em qualquer proxy", () => {
    expect(() => loadAppEnv({ ...validEnvironment, TRUST_PROXY: "true" })).toThrow("TRUST_PROXY");
    expect(loadAppEnv({ ...validEnvironment, TRUST_PROXY: "10.0.0.0/8,127.0.0.1" }).TRUST_PROXY).toEqual([
      "10.0.0.0/8",
      "127.0.0.1",
    ]);
  });

  it("não inclui valores sensíveis ao relatar configuração inválida", () => {
    const exposedSecret = "short-sensitive-value";
    expect(() => loadAppEnv({ ...validEnvironment, API_SECRET: exposedSecret })).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(exposedSecret) }),
    );
  });

  it("não desativa TLS silenciosamente na migration", () => {
    expect(() =>
      loadDatabaseMigrationEnv({
        DATABASE_URL: validEnvironment.DATABASE_URL,
        DATABASE_SSL: "tru",
      }),
    ).toThrow("DATABASE_SSL");
    expect(() =>
      loadDatabaseMigrationEnv({
        DATABASE_URL: `${validEnvironment.DATABASE_URL}?sslmode=disable`,
        DATABASE_SSL: "true",
      }),
    ).toThrow("DATABASE_URL");
    expect(() =>
      createDatabasePool({
        databaseUrl: `${validEnvironment.DATABASE_URL}?ssl=false`,
        ssl: true,
      }),
    ).toThrow("SSL");
    expect(() =>
      loadDatabaseMigrationEnv({
        NODE_ENV: "production",
        DATABASE_URL: validEnvironment.DATABASE_URL,
        DATABASE_SSL: "false",
      }),
    ).toThrow("DATABASE_SSL");
  });
});
