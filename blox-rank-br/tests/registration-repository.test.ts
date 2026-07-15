import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initialSchemaSql } from "../src/database/migrations/001_initial_schema.js";
import type { Queryable } from "../src/database/pool.js";
import { RegistrationRepository } from "../src/repositories/registration-repository.js";

const TOURNAMENT_ID = "11111111-1111-4111-8111-111111111111";
const REJECTED_ID = "22222222-2222-4222-8222-222222222222";
const PENDING_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PENDING_ID = "44444444-4444-4444-8444-444444444444";
const DISCORD_ID = "123456789012345678";

describe("RegistrationRepository", () => {
  const database = new PGlite();
  const repository = new RegistrationRepository(database as unknown as Queryable);

  beforeAll(async () => {
    await database.exec(initialSchemaSql);
    await database.query(
      `INSERT INTO tournaments (id, name, status, max_players)
       VALUES ($1, 'Edição de teste', 'registrations_open', 16)`,
      [TOURNAMENT_ID],
    );
    await database.query(
      `INSERT INTO registrations (
         id, tournament_id, roblox_username, discord_user_id, discord_username,
         level, bounty_honor, faction, platform, main_fruit, status, rejection_reason
       ) VALUES
         ($1, $4, 'NickAntigo', $5, 'discord.antigo', 2550, 1000000,
          'pirate', 'pc', 'Ice', 'rejected', 'Cadastro substituído'),
         ($2, $4, 'NickNovo', $5, 'discord.novo', 2550, 5000000,
          'pirate', 'pc', 'Dragon', 'pending', NULL),
         ($3, $4, 'PercentPlayer', '223456789012345678', 'percent%discord', 2550, 2500000,
          'marine', 'mobile', 'Light', 'pending', NULL)`,
      [REJECTED_ID, PENDING_ID, OTHER_PENDING_ID, TOURNAMENT_ID, DISCORD_ID],
    );
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("resolve a pending mesmo quando existe uma rejeitada antiga para o mesmo usuário", async () => {
    await expect(repository.getPendingByDiscordUserId(TOURNAMENT_ID, DISCORD_ID)).resolves
      .toMatchObject({ id: PENDING_ID, status: "pending", robloxUsername: "NickNovo" });
    await expect(repository.getByDiscordUserId(TOURNAMENT_ID, DISCORD_ID)).resolves
      .toMatchObject({ id: PENDING_ID, status: "pending" });
  });

  it("pesquisa pending por nick e nome Discord com ordenação estável", async () => {
    await expect(repository.searchPending(TOURNAMENT_ID, "nicknovo")).resolves
      .toMatchObject([{ id: PENDING_ID }]);
    await expect(repository.searchPending(TOURNAMENT_ID, "discord.novo")).resolves
      .toMatchObject([{ id: PENDING_ID }]);

    const all = await repository.searchPending(TOURNAMENT_ID, "");
    expect(all.map((registration) => registration.id)).toEqual([PENDING_ID, OTHER_PENDING_ID]);
    expect(all.every((registration) => registration.status === "pending")).toBe(true);
  });

  it("trata curingas de LIKE como texto e limita o autocomplete a 25", async () => {
    await expect(repository.searchPending(TOURNAMENT_ID, "%")).resolves
      .toMatchObject([{ id: OTHER_PENDING_ID }]);
    await expect(repository.searchPending(TOURNAMENT_ID, "", 26)).rejects
      .toThrow("limit deve ser um inteiro entre 1 e 25");
  });
});
