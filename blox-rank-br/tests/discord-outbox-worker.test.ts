import type { Client } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/config/env.js";
import { DiscordOutboxWorker } from "../src/services/discord-outbox-worker.js";
import type { DiscordOutboxMessage } from "../src/types/domain.js";

const GUILD_ID = "111111111111111111";
const LOGS_CHANNEL_ID = "222222222222222222";
const ACTOR_ID = "333333333333333333";
const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";

describe("DiscordOutboxWorker", () => {
  it("publica o log de uma inscrição criada pela equipe", async () => {
    const send = vi.fn(async (_payload: unknown) => undefined);
    const channel = {
      id: LOGS_CHANNEL_ID,
      guildId: GUILD_ID,
      isDMBased: () => false,
      isSendable: () => true,
      send,
    };
    const client = {
      channels: { fetch: vi.fn(async () => channel) },
    } as unknown as Client;
    const worker = new DiscordOutboxWorker({
      client,
      env: {
        DISCORD_GUILD_ID: GUILD_ID,
        DISCORD_LOGS_CHANNEL_ID: LOGS_CHANNEL_ID,
      } as AppEnv,
      outbox: {} as never,
      registrations: {} as never,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    const message: DiscordOutboxMessage = {
      id: "22222222-2222-4222-8222-222222222222",
      eventType: "administrative.action",
      channelId: LOGS_CHANNEL_ID,
      payload: {
        action: "registration.created_by_staff",
        actorDiscordId: ACTOR_ID,
        targetId: REGISTRATION_ID,
        robloxUsername: "Jogador_BR",
      },
      status: "processing",
      attempts: 1,
      maxAttempts: 100,
      availableAt: new Date("2026-07-14T12:00:00.000Z"),
      lockedAt: new Date("2026-07-14T12:00:00.000Z"),
      lockedBy: "worker-test",
      processedAt: null,
      lastError: null,
      deduplicationKey: `registration.created_by_staff:${REGISTRATION_ID}`,
      createdAt: new Date("2026-07-14T12:00:00.000Z"),
      updatedAt: new Date("2026-07-14T12:00:00.000Z"),
    };

    await (worker as unknown as {
      dispatch(outboxMessage: DiscordOutboxMessage): Promise<void>;
    }).dispatch(message);

    expect(send).toHaveBeenCalledOnce();
    const payload = send.mock.calls[0]![0];
    expect(JSON.stringify(payload)).toContain("Inscrição criada pela equipe");
    expect(JSON.stringify(payload)).toContain("Jogador\\\\_BR");
    expect(payload).toMatchObject({
      allowedMentions: { parse: [], repliedUser: false },
      enforceNonce: true,
    });
  });
});
