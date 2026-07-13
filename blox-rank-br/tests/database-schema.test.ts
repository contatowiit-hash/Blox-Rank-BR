import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initialSchemaSql } from "../src/database/migrations/001_initial_schema.js";
import type { Queryable } from "../src/database/pool.js";
import { OutboxRepository } from "../src/repositories/outbox-repository.js";

const TOURNAMENT_ONE = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_TWO = "22222222-2222-4222-8222-222222222222";
const REGISTRATION_ONE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REGISTRATION_TWO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REGISTRATION_THREE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const REGISTRATION_FOUR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MATCH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const DISCORD_ID = "123456789012345678";
const ACTOR_ID = "876543210987654321";

describe("migration PostgreSQL", () => {
  const database = new PGlite();

  beforeAll(async () => {
    await database.exec(initialSchemaSql);
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it("executa o schema e aplica isolamento, unicidade e invariantes do chaveamento", async () => {
    await database.query(
      `INSERT INTO tournaments (id, name, status, max_players)
       VALUES ($1, 'Edição 1', 'registrations_open', 16)`,
      [TOURNAMENT_ONE],
    );
    await database.query(
      `INSERT INTO registrations (
         id, tournament_id, roblox_username, discord_user_id, discord_username,
         level, bounty_honor, faction, platform, main_fruit
       ) VALUES ($1, $2, 'Jogador_BR', $3, 'Jogador', 2550, 30000000, 'pirate', 'pc', 'Dragon')`,
      [REGISTRATION_ONE, TOURNAMENT_ONE, DISCORD_ID],
    );

    await expect(
      database.query(
        `INSERT INTO registrations (
           id, tournament_id, roblox_username, discord_user_id, discord_username,
           level, bounty_honor, faction, platform, main_fruit
         ) VALUES ($1, $2, 'jogador_br', $3, 'Outro', 2550, 1, 'marine', 'mobile', 'Ice')`,
        [REGISTRATION_TWO, TOURNAMENT_ONE, DISCORD_ID],
      ),
    ).rejects.toBeDefined();

    await database.query(
      `UPDATE registrations
       SET status = 'rejected', rejection_reason = 'Identidade não confirmada'
       WHERE id = $1`,
      [REGISTRATION_ONE],
    );
    await database.query(
      `INSERT INTO registrations (
         id, tournament_id, roblox_username, discord_user_id, discord_username,
         level, bounty_honor, faction, platform, main_fruit, status, approved_by_discord_id
       ) VALUES ($1, $2, 'Jogador_BR', $3, 'Jogador', 2550, 30000000, 'pirate', 'pc', 'Dragon', 'approved', $4)`,
      [REGISTRATION_TWO, TOURNAMENT_ONE, DISCORD_ID, ACTOR_ID],
    );

    await expect(
      database.query(
        `INSERT INTO tournaments (id, name, status, max_players)
         VALUES ($1, 'Edição concorrente', 'registrations_open', 16)`,
        [TOURNAMENT_TWO],
      ),
    ).rejects.toBeDefined();

    await database.query("UPDATE tournaments SET status = 'finished' WHERE id = $1", [TOURNAMENT_ONE]);
    await database.query(
      `INSERT INTO tournaments (id, name, status, max_players)
       VALUES ($1, 'Edição 2', 'registrations_open', 16)`,
      [TOURNAMENT_TWO],
    );
    await database.query(
      `INSERT INTO registrations (
         id, tournament_id, roblox_username, discord_user_id, discord_username,
         level, bounty_honor, faction, platform, main_fruit
       ) VALUES ($1, $2, 'Jogador_BR', $3, 'Jogador', 2550, 30000000, 'pirate', 'pc', 'Dragon')`,
      [REGISTRATION_THREE, TOURNAMENT_TWO, DISCORD_ID],
    );

    await database.query(
      `INSERT INTO registrations (
         id, tournament_id, roblox_username, discord_user_id, discord_username,
         level, bounty_honor, faction, platform, main_fruit, status, approved_by_discord_id
       ) VALUES ($1, $2, 'Segundo_BR', '223456789012345678', 'Segundo', 2550, 20000000,
         'marine', 'console', 'Ice', 'approved', $3)`,
      [REGISTRATION_FOUR, TOURNAMENT_ONE, ACTOR_ID],
    );
    await database.query(
      `INSERT INTO tournament_players (tournament_id, registration_id, seed)
       VALUES ($1, $2, 1), ($1, $3, 2)`,
      [TOURNAMENT_ONE, REGISTRATION_TWO, REGISTRATION_FOUR],
    );

    await expect(
      database.query(
        `INSERT INTO tournament_players (tournament_id, registration_id, seed)
         VALUES ($1, $2, 1)`,
        [TOURNAMENT_TWO, REGISTRATION_TWO],
      ),
    ).rejects.toBeDefined();

    await database.query(
      `INSERT INTO matches (
         id, tournament_id, round, bracket_position,
         player_one_registration_id, player_two_registration_id
       ) VALUES ($1, $2, 1, 1, $3, $4)`,
      [MATCH_ID, TOURNAMENT_ONE, REGISTRATION_TWO, REGISTRATION_FOUR],
    );
    await expect(
      database.query(
        `UPDATE matches SET status = 'completed', player_one_score = 2,
           player_two_score = 2, winner_registration_id = $2 WHERE id = $1`,
        [MATCH_ID, REGISTRATION_TWO],
      ),
    ).rejects.toBeDefined();
    await database.query(
      `UPDATE matches SET status = 'completed', player_one_score = 2,
         player_two_score = 1, winner_registration_id = $2 WHERE id = $1`,
      [MATCH_ID, REGISTRATION_TWO],
    );

    await expect(
      database.query(
        `INSERT INTO discord_outbox (id, event_type, channel_id, payload, status)
         VALUES ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'test', '323456789012345678', '{}', 'processing')`,
      ),
    ).rejects.toBeDefined();

    const result = await database.query<{ count: number }>(
      "SELECT COUNT(*)::INTEGER AS count FROM matches WHERE status = 'completed'",
    );
    expect(result.rows[0]?.count).toBe(1);
  }, 30_000);

  it("protege a confirmação da outbox por lease e apaga o payload após processar", async () => {
    const outbox = new OutboxRepository(database as unknown as Queryable);
    const message = await outbox.enqueue({
      eventType: "test.event",
      channelId: "423456789012345678",
      payload: { discordUserId: DISCORD_ID },
      deduplicationKey: "schema-test-lease",
    });
    expect(message.maxAttempts).toBe(100);
    expect(await outbox.claimPending(1, "worker-one")).toHaveLength(1);

    await database.query(
      "UPDATE discord_outbox SET locked_at = NOW() - INTERVAL '10 minutes' WHERE id = $1",
      [message.id],
    );
    expect(await outbox.claimPending(1, "worker-two", undefined, 1_000)).toHaveLength(1);
    expect(await outbox.markProcessed(message.id, "worker-one")).toBeNull();

    const processed = await outbox.markProcessed(message.id, "worker-two");
    expect(processed?.status).toBe("processed");
    expect(processed?.payload).toEqual({});

    const terminalFailure = await outbox.enqueue({
      eventType: "test.failure",
      channelId: "423456789012345678",
      payload: { discordUserId: DISCORD_ID },
      deduplicationKey: "schema-test-terminal-failure",
      maxAttempts: 1,
    });
    await outbox.claimPending(1, "worker-three");
    const failed = await outbox.markFailed(
      terminalFailure.id,
      "worker-three",
      "SyntheticError",
      1_000,
    );
    expect(failed?.status).toBe("failed");
    expect(failed?.payload).toEqual({});
  });
});
