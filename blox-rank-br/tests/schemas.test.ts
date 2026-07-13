import { describe, expect, it } from "vitest";
import {
  createRegistrationSchema,
  matchResultSchema,
  updateRegistrationStatusSchema,
  registrationListQuerySchema,
} from "../src/utils/schemas.js";

const validRegistration = {
  roblox_username: "Jogador_BR",
  discord_user_id: "123456789012345678",
  discord_username: " Jogador   Legal ",
  level: 2_550,
  bounty_honor: 30_000_000,
  faction: "pirate",
  platform: "pc",
  main_fruit: " Dragon ",
} as const;

describe("validação de entrada", () => {
  it("normaliza textos seguros sem alterar o nick Roblox", () => {
    const result = createRegistrationSchema.parse(validRegistration);
    expect(result.discord_username).toBe("Jogador Legal");
    expect(result.main_fruit).toBe("Dragon");
    expect(result.roblox_username).toBe("Jogador_BR");
  });

  it("rejeita campos desconhecidos e IDs inválidos", () => {
    expect(
      createRegistrationSchema.safeParse({ ...validRegistration, api_secret: "não pode" }).success,
    ).toBe(false);
    expect(
      createRegistrationSchema.safeParse({ ...validRegistration, discord_user_id: "123" }).success,
    ).toBe(false);
  });

  it("exige motivo ao recusar e proíbe motivo na aprovação", () => {
    expect(updateRegistrationStatusSchema.safeParse({ status: "rejected" }).success).toBe(false);
    expect(updateRegistrationStatusSchema.safeParse({ status: "rejected", rejection_reason: "Duplicada" }).success).toBe(true);
    expect(updateRegistrationStatusSchema.safeParse({ status: "approved", rejection_reason: "extra" }).success).toBe(false);
  });

  it("rejeita empate, placar negativo e campos extras", () => {
    expect(matchResultSchema.safeParse({ player_one_score: 2, player_two_score: 2 }).success).toBe(false);
    expect(matchResultSchema.safeParse({ player_one_score: -1, player_two_score: 2 }).success).toBe(false);
    expect(matchResultSchema.safeParse({ player_one_score: 2, player_two_score: 1, winner: "A" }).success).toBe(false);
  });

  it("limita paginação para evitar offsets abusivos", () => {
    expect(registrationListQuerySchema.safeParse({ page: "10001", limit: "25" }).success).toBe(false);
    expect(registrationListQuerySchema.parse({ page: "2", limit: "25" })).toMatchObject({
      page: 2,
      limit: 25,
    });
  });
});
