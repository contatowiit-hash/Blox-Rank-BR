import { describe, expect, it, vi } from "vitest";
import {
  ApiClientError,
  PublicApiClient,
  publicErrorResponse,
  readPublicSocialConfig,
  registrationInputSchema,
  sanitizeApprovedParticipants,
} from "@/app/lib/api";
import type { ApiFetch, BackendRegistration, RegistrationInput } from "@/app/lib/api";

const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TOURNAMENT_ID = "33333333-3333-4333-8333-333333333333";
const FIXED_DATE = "2026-07-12T12:00:00.000Z";

const validInput: RegistrationInput = {
  roblox_username: "Jogador_BR",
  discord_user_id: "123456789012345678",
  discord_username: "Jogador Legal",
  level: 2_550,
  bounty_honor: 30_000_000,
  faction: "pirate",
  platform: "pc",
  main_fruit: "Dragon",
};

function registration(overrides: Partial<BackendRegistration> = {}): BackendRegistration {
  return {
    id: REGISTRATION_ID,
    tournament_id: TOURNAMENT_ID,
    roblox_username: "Jogador_BR",
    discord_user_id: "123456789012345678",
    discord_username: "Nome privado",
    level: 2_550,
    bounty_honor: 30_000_000,
    faction: "pirate",
    platform: "pc",
    main_fruit: "Dragon",
    status: "approved",
    rejection_reason: null,
    approved_by_discord_id: "987654321098765432",
    created_at: FIXED_DATE,
    updated_at: FIXED_DATE,
    ...overrides,
  };
}

describe("contratos da API p\u00fablica", () => {
  it("normaliza textos e rejeita campos desconhecidos", () => {
    const parsed = registrationInputSchema.parse({
      ...validInput,
      discord_username: "  Jogador\u0000   Legal  ",
      main_fruit: "  Dragon  ",
    });
    expect(parsed.discord_username).toBe("Jogador Legal");
    expect(parsed.main_fruit).toBe("Dragon");
    expect(registrationInputSchema.safeParse({ ...validInput, api_token: "nunca" }).success).toBe(false);
  });

  it("preserva conflito de duplicidade sem expor detalhes internos", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "CONFLICT",
            message: "J\u00e1 existe uma inscri\u00e7\u00e3o com este Discord ou nome do Roblox.",
            requestId: "req-safe",
          },
        },
        { status: 409 },
      ),
    ) as unknown as ApiFetch;
    const client = new PublicApiClient({ baseUrl: "https://api.example.com", fetcher });

    await expect(client.createRegistration(validInput)).rejects.toMatchObject({
      name: "ApiClientError",
      kind: "upstream",
      status: 409,
      code: "CONFLICT",
      requestId: "req-safe",
    });
  });

  it("converte falha de rede em resposta offline sem vazar a causa", async () => {
    const sensitiveCause = "connect ECONNREFUSED API_ADMIN_TOKEN=segredo-interno";
    const fetcher = vi.fn(async () => {
      throw new Error(sensitiveCause);
    }) as unknown as ApiFetch;
    const client = new PublicApiClient({ baseUrl: "https://api.example.com", fetcher });

    let error: unknown;
    try {
      await client.getCurrentTournament();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ApiClientError);
    const response = publicErrorResponse(error);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(sensitiveCause);
  });

  it("publica somente aprovados do torneio e remove toda informa\u00e7\u00e3o do Discord", () => {
    const participants = sanitizeApprovedParticipants(
      [
        registration({ bounty_honor: 10 }),
        registration({
          id: "44444444-4444-4444-8444-444444444444",
          roblox_username: "Maior_Bounty",
          bounty_honor: 50,
          discord_user_id: "223456789012345678",
          discord_username: "Outro privado",
        }),
        registration({ id: "55555555-5555-4555-8555-555555555555", status: "pending" }),
        registration({ id: "66666666-6666-4666-8666-666666666666", tournament_id: OTHER_TOURNAMENT_ID }),
      ],
      TOURNAMENT_ID,
    );

    expect(participants.map((participant) => participant.roblox_username)).toEqual([
      "Maior_Bounty",
      "Jogador_BR",
    ]);
    const serialized = JSON.stringify(participants);
    expect(serialized).not.toContain("discord");
    expect(serialized).not.toContain("approved_by");
    expect(serialized).not.toContain("rejection_reason");
    expect(Object.keys(participants[0] ?? {}).sort()).toEqual(
      [
        "bounty_honor",
        "faction",
        "id",
        "level",
        "main_fruit",
        "platform",
        "roblox_username",
        "tournament_id",
      ].sort(),
    );
  });

  it("exp\u00f5e somente links HTTPS configurados", () => {
    expect(
      readPublicSocialConfig({
        PUBLIC_DISCORD_URL: "https://discord.gg/blox-rank",
        PUBLIC_TIKTOK_URL: undefined,
        PUBLIC_YOUTUBE_URL: "https://youtube.com/@bloxrank",
        API_ADMIN_TOKEN: "nunca-deve-aparecer",
      }),
    ).toEqual({
      discord_url: "https://discord.gg/blox-rank",
      tiktok_url: null,
      youtube_url: "https://youtube.com/@bloxrank",
    });
    expect(() => readPublicSocialConfig({ PUBLIC_DISCORD_URL: "http://discord.gg/inseguro" })).toThrow(
      "temporariamente indispon\u00edvel",
    );
  });
});
