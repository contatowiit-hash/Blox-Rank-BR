import { describe, expect, it } from "vitest";
import { PermissionFlagsBits } from "discord.js";
import { commandDefinitions, DISCORD_COMMAND_NAMES } from "../src/commands/definitions.js";
import { createNewRegistrationEmbed, createPendingRegistrationEmbeds, createRegistrationActionRow } from "../src/commands/embeds.js";
import { hasUnsafeParticipantPermissions } from "../src/utils/discord-permissions.js";

describe("comandos e embeds do Discord", () => {
  it("serializa comandos simples com seleção de jogador por menção", () => {
    const commands = commandDefinitions.map((definition) => definition.toJSON());
    expect(commands.map((command) => command.name)).toEqual([
      DISCORD_COMMAND_NAMES.registrations,
      DISCORD_COMMAND_NAMES.approve,
      DISCORD_COMMAND_NAMES.reject,
      DISCORD_COMMAND_NAMES.result,
      DISCORD_COMMAND_NAMES.tournament,
      DISCORD_COMMAND_NAMES.openRegistrations,
      DISCORD_COMMAND_NAMES.closeRegistrations,
      DISCORD_COMMAND_NAMES.generateBracket,
      DISCORD_COMMAND_NAMES.participants,
      DISCORD_COMMAND_NAMES.bracket,
      DISCORD_COMMAND_NAMES.ping,
    ]);

    const approve = commands.find((command) => command.name === DISCORD_COMMAND_NAMES.approve);
    const reject = commands.find((command) => command.name === DISCORD_COMMAND_NAMES.reject);
    const result = commands.find((command) => command.name === DISCORD_COMMAND_NAMES.result);
    expect(approve?.options).toMatchObject([{ name: "jogador", required: true, type: 6 }]);
    expect(reject?.options).toMatchObject([
      { name: "jogador", required: true, type: 6 },
      { name: "motivo", required: true, min_length: 3, max_length: 500 },
    ]);
    expect(result?.options).toMatchObject([
      { name: "partida", required: true, autocomplete: true },
      { name: "placar_jogador_1", required: true, min_value: 0, max_value: 100 },
      { name: "placar_jogador_2", required: true, min_value: 0, max_value: 100 },
    ]);
    for (const name of [
      DISCORD_COMMAND_NAMES.openRegistrations,
      DISCORD_COMMAND_NAMES.closeRegistrations,
      DISCORD_COMMAND_NAMES.generateBracket,
      DISCORD_COMMAND_NAMES.participants,
      DISCORD_COMMAND_NAMES.bracket,
    ]) {
      expect(commands.find((command) => command.name === name)?.options ?? []).toHaveLength(0);
    }
  });

  it("cria botões com UUID interno sem colocar dados do jogador no custom id", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const components = createRegistrationActionRow(id).toJSON().components;
    expect(components).toHaveLength(3);
    expect(components.map((component) => "custom_id" in component ? component.custom_id : "")).toEqual([
      `registration:approve:${id}`, `registration:reject:${id}`, `registration:details:${id}`,
    ]);
  });

  it("neutraliza menções e mantém listas dentro dos limites de embed", () => {
    const registration = {
      id: "11111111-1111-4111-8111-111111111111",
      robloxUsername: "Jogador_BR",
      discordUserId: "123456789012345678",
      discordUsername: "@everyone",
      level: 2_550,
      bountyHonor: 30_000_000,
      faction: "pirate" as const,
      platform: "pc" as const,
      mainFruit: "Dragon",
    };
    const json = createNewRegistrationEmbed(registration).toJSON();
    expect(JSON.stringify(json)).not.toContain("@everyone");
    expect(JSON.stringify(json)).not.toContain(registration.id);
    expect(JSON.stringify(json)).not.toContain(registration.discordUserId);

    const embeds = createPendingRegistrationEmbeds(
      Array.from({ length: 25 }, (_, index) => ({
        ...registration,
        id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      })),
    );
    expect(embeds.length).toBeLessThanOrEqual(10);
    expect(embeds.every((embed) => (embed.toJSON().fields?.length ?? 0) <= 25)).toBe(true);
  });

  it("permite apenas capacidades comuns no cargo de participante", () => {
    expect(
      hasUnsafeParticipantPermissions(
        PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.Speak,
      ),
    ).toBe(false);
    expect(hasUnsafeParticipantPermissions(PermissionFlagsBits.Administrator)).toBe(true);
    expect(hasUnsafeParticipantPermissions(PermissionFlagsBits.ModerateMembers)).toBe(true);
    expect(hasUnsafeParticipantPermissions(PermissionFlagsBits.MuteMembers)).toBe(true);
    expect(hasUnsafeParticipantPermissions(PermissionFlagsBits.ManageEvents)).toBe(true);
  });
});
