import { describe, expect, it, vi } from "vitest";
import type { ApplicationContext } from "../src/application-context.js";
import { createDiscordInteractionHandler } from "../src/commands/handlers.js";
import type { AppEnv } from "../src/config/env.js";

const GUILD_ID = "111111111111111111";
const STAFF_ROLE_ID = "222222222222222222";
const USER_ID = "333333333333333333";
const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";

const env = {
  DISCORD_GUILD_ID: GUILD_ID,
  DISCORD_STAFF_ROLE_ID: STAFF_ROLE_ID,
} as AppEnv;

function options(context: Partial<ApplicationContext>) {
  return {
    env,
    context: context as ApplicationContext,
    healthCheck: vi.fn(async () => true),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

function baseInteraction() {
  return {
    id: "interaction-1", guildId: GUILD_ID, user: { id: USER_ID },
    member: { roles: [STAFF_ROLE_ID] }, inGuild: () => true,
    isAutocomplete: () => false, isButton: () => false, isModalSubmit: () => false,
    isChatInputCommand: () => false,
  };
}

describe("interações de UX do Discord", () => {
  it("busca inscrições pendentes por Roblox/Discord e limita o autocomplete a 25", async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      id: `${String(index).padStart(8, "0")}-1111-4111-8111-111111111111`,
      robloxUsername: `BuscaPlayer${index}`, discordUsername: `discord${index}`,
      bountyHonor: 1_000_000 + index, status: "pending",
    }));
    const list = vi.fn(async () => ({ items, total: items.length, page: 1, limit: 100 }));
    const respond = vi.fn();
    const interaction = {
      ...baseInteraction(), isAutocomplete: () => true, commandName: "aprovar",
      options: { getFocused: () => ({ name: "inscricao", value: "busca" }) }, respond,
    };
    await createDiscordInteractionHandler(options({ services: { registrations: { list } } } as never))(interaction as never);
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 100, status: "pending" });
    expect(respond).toHaveBeenCalledOnce();
    const choices = respond.mock.calls[0]![0] as Array<{ name: string; value: string }>;
    expect(choices).toHaveLength(25);
    expect(choices[0]?.name).toContain("BuscaPlayer0");
    expect(choices[0]?.name).toContain("discord0");
    expect(choices[0]?.value).toBe(items[0]!.id);
  });

  it("oferece somente partidas jogáveis e pendentes no autocomplete de resultado", async () => {
    const respond = vi.fn();
    const getCurrentBracket = vi.fn(async () => ({ tournament: {}, matches: [
      { id: REGISTRATION_ID, round: 2, status: "pending", playerOne: { robloxUsername: "Alpha" }, playerTwo: { robloxUsername: "Beta" }, playerOneScore: null, playerTwoScore: null },
      { id: "22222222-2222-4222-8222-222222222222", round: 1, status: "completed", playerOne: { robloxUsername: "C" }, playerTwo: { robloxUsername: "D" } },
      { id: "33333333-3333-4333-8333-333333333333", round: 3, status: "pending", playerOne: null, playerTwo: null },
    ] }));
    const interaction = { ...baseInteraction(), isAutocomplete: () => true, commandName: "resultado",
      options: { getFocused: () => ({ name: "partida", value: "alpha" }) }, respond };
    await createDiscordInteractionHandler(options({ services: { tournaments: { getCurrentBracket } } } as never))(interaction as never);
    const choices = respond.mock.calls[0]![0] as Array<{ name: string; value: string }>;
    expect(choices).toHaveLength(1);
    expect(choices[0]).toMatchObject({ value: REGISTRATION_ID });
    expect(choices[0]?.name).toContain("Alpha x Beta");
  });

  it("abre modal de recusa para staff e não executa alteração antes do envio", async () => {
    const showModal = vi.fn();
    const updateStatus = vi.fn();
    const interaction = { ...baseInteraction(), isButton: () => true,
      customId: `registration:reject:${REGISTRATION_ID}`, showModal };
    await createDiscordInteractionHandler(options({ services: { registrations: { updateStatus } } } as never))(interaction as never);
    expect(showModal).toHaveBeenCalledOnce();
    expect(showModal.mock.calls[0]![0].toJSON()).toMatchObject({ custom_id: `registration:reject-modal:${REGISTRATION_ID}` });
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("bloqueia botões administrativos sem o cargo configurado", async () => {
    const reply = vi.fn();
    const updateStatus = vi.fn();
    const interaction = { ...baseInteraction(), member: { roles: [] }, isButton: () => true,
      customId: `registration:approve:${REGISTRATION_ID}`, reply };
    await createDiscordInteractionHandler(options({ services: { registrations: { updateStatus } } } as never))(interaction as never);
    expect(reply).toHaveBeenCalledOnce();
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("envia o motivo do modal sanitizado ao serviço de recusa", async () => {
    const updateStatus = vi.fn(async () => ({ robloxUsername: "Jogador" }));
    const deferReply = vi.fn(async function (this: { deferred: boolean }) { this.deferred = true; });
    const editReply = vi.fn();
    const interaction = { ...baseInteraction(), deferred: false, replied: false,
      isModalSubmit: () => true, customId: `registration:reject-modal:${REGISTRATION_ID}`,
      fields: { getTextInputValue: () => "  Uso de script  " }, deferReply, editReply };
    await createDiscordInteractionHandler(options({ services: { registrations: { updateStatus } } } as never))(interaction as never);
    expect(updateStatus).toHaveBeenCalledWith(REGISTRATION_ID,
      { status: "rejected", rejection_reason: "Uso de script" }, USER_ID);
    expect(editReply).toHaveBeenCalledOnce();
  });
});
