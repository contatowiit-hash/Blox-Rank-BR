import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type {
  AuditLogRepository,
  MatchRepository,
  OutboxRepository,
  RegistrationRepository,
  TournamentRepository,
} from "../src/repositories/index.js";
import { TournamentService } from "../src/services/tournament-service.js";
import type {
  CreateAuditLogInput,
  CreateBracketMatchInput,
  EnqueueDiscordOutboxInput,
  Registration,
  SeededTournamentPlayer,
  Tournament,
} from "../src/types/domain.js";

const TOURNAMENT_ID = "10000000-0000-4000-8000-000000000001";
const ACTOR_DISCORD_ID = "123456789012345678";
const FIXED_DATE = new Date("2026-07-12T12:00:00.000Z");

const closedTournament: Tournament = {
  id: TOURNAMENT_ID,
  name: "Blox Rank BR",
  status: "registrations_closed",
  maxPlayers: 16,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
};

const activeTournament: Tournament = {
  ...closedTournament,
  status: "active",
};

function registrationId(seed: number): string {
  return `20000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function createApprovedRegistrations(): Registration[] {
  return Array.from({ length: 16 }, (_, index) => {
    const seed = index + 1;
    return {
      id: registrationId(seed),
      tournamentId: TOURNAMENT_ID,
      robloxUsername: `Jogador_${seed}`,
      discordUserId: String(200_000_000_000_000_000n + BigInt(seed)),
      discordUsername: `jogador${seed}`,
      level: 2_600,
      bountyHonor: 100_000_000 - index,
      faction: seed % 2 === 0 ? "marine" : "pirate",
      platform: "pc",
      mainFruit: "Dragon",
      status: "approved",
      rejectionReason: null,
      approvedByDiscordId: ACTOR_DISCORD_ID,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    };
  });
}

function createTransactionFake() {
  const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  const pool = { connect } as unknown as Pool;
  return { pool, client, connect, query, release };
}

function createHarness(approvedCount = 16, existingMatches = 0) {
  const transaction = createTransactionFake();
  const approved = createApprovedRegistrations();

  const registrations = {
    countApproved: vi.fn(async (_tournamentId: string, _client: PoolClient) => approvedCount),
    listApprovedForUpdate: vi.fn(
      async (_tournamentId: string, _limit: number, _client: PoolClient) => approved,
    ),
  };
  const tournaments = {
    getByIdForUpdate: vi.fn(async (_id: string, _client: PoolClient) => closedTournament),
    addPlayers: vi.fn(
      async (
        _id: string,
        _players: readonly SeededTournamentPlayer[],
        _client: PoolClient,
      ) => [],
    ),
    updateStatus: vi.fn(async (_id: string, _status: string, _client: PoolClient) => activeTournament),
  };
  const matches = {
    countByTournament: vi.fn(async (_id: string, _client: PoolClient) => existingMatches),
    createBracket: vi.fn(
      async (
        _id: string,
        _matches: readonly CreateBracketMatchInput[],
        _client: PoolClient,
      ) => [],
    ),
    listBracket: vi.fn(async (_id: string) => []),
  };
  const auditLogs = {
    create: vi.fn(async (_input: CreateAuditLogInput, _client: PoolClient) => ({})),
  };
  const outbox = {
    enqueue: vi.fn(async (_input: EnqueueDiscordOutboxInput, _client: PoolClient) => ({})),
  };

  const service = new TournamentService({
    pool: transaction.pool,
    registrations: registrations as unknown as RegistrationRepository,
    tournaments: tournaments as unknown as TournamentRepository,
    matches: matches as unknown as MatchRepository,
    auditLogs: auditLogs as unknown as AuditLogRepository,
    outbox: outbox as unknown as OutboxRepository,
    logsChannelId: "345678901234567890",
  });

  return {
    service,
    transaction,
    approved,
    registrations,
    tournaments,
    matches,
    auditLogs,
    outbox,
  };
}

describe("TournamentService.generateBracket", () => {
  it("gera 15 partidas com seeds corretos e usa o mesmo client em toda a transa\u00e7\u00e3o", async () => {
    const harness = createHarness();

    const result = await harness.service.generateBracket(TOURNAMENT_ID, ACTOR_DISCORD_ID);

    expect(result).toEqual({ tournament: activeTournament, matches: [] });
    expect(harness.tournaments.addPlayers).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      harness.approved.map((registration, index) => ({
        registrationId: registration.id,
        seed: index + 1,
      })),
      harness.transaction.client,
    );

    expect(harness.matches.createBracket).toHaveBeenCalledTimes(1);
    const createBracketCall = harness.matches.createBracket.mock.calls[0];
    expect(createBracketCall).toBeDefined();
    const generatedMatches = createBracketCall![1];
    expect(generatedMatches).toHaveLength(15);
    expect(generatedMatches.filter(({ round }) => round === 1)).toHaveLength(8);
    expect(generatedMatches.filter(({ round }) => round === 2)).toHaveLength(4);
    expect(generatedMatches.filter(({ round }) => round === 3)).toHaveLength(2);
    expect(generatedMatches.filter(({ round }) => round === 4)).toHaveLength(1);
    expect(
      generatedMatches
        .filter(({ round }) => round === 1)
        .map(({ playerOneRegistrationId, playerTwoRegistrationId }) => [
          playerOneRegistrationId,
          playerTwoRegistrationId,
        ]),
    ).toEqual([
      [registrationId(1), registrationId(16)],
      [registrationId(8), registrationId(9)],
      [registrationId(4), registrationId(13)],
      [registrationId(5), registrationId(12)],
      [registrationId(2), registrationId(15)],
      [registrationId(7), registrationId(10)],
      [registrationId(3), registrationId(14)],
      [registrationId(6), registrationId(11)],
    ]);

    const client = harness.transaction.client;
    expect(harness.tournaments.getByIdForUpdate).toHaveBeenCalledWith(TOURNAMENT_ID, client);
    expect(harness.matches.countByTournament).toHaveBeenCalledWith(TOURNAMENT_ID, client);
    expect(harness.registrations.countApproved).toHaveBeenCalledWith(TOURNAMENT_ID, client);
    expect(harness.registrations.listApprovedForUpdate).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      16,
      client,
    );
    expect(harness.matches.createBracket).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      generatedMatches,
      client,
    );
    expect(harness.tournaments.updateStatus).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      "active",
      client,
    );
    expect(harness.auditLogs.create.mock.calls[0]?.[1]).toBe(client);
    expect(harness.outbox.enqueue.mock.calls[0]?.[1]).toBe(client);
    expect(harness.transaction.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(harness.transaction.release).toHaveBeenCalledTimes(1);
  });

  it.each([15, 17])(
    "rejeita quando existem %i aprovados, faz rollback e n\u00e3o cria partidas",
    async (approvedCount) => {
      const harness = createHarness(approvedCount);

      await expect(
        harness.service.generateBracket(TOURNAMENT_ID, ACTOR_DISCORD_ID),
      ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });

      expect(harness.registrations.listApprovedForUpdate).not.toHaveBeenCalled();
      expect(harness.tournaments.addPlayers).not.toHaveBeenCalled();
      expect(harness.matches.createBracket).not.toHaveBeenCalled();
      expect(harness.auditLogs.create).not.toHaveBeenCalled();
      expect(harness.outbox.enqueue).not.toHaveBeenCalled();
      expect(harness.transaction.query.mock.calls.map(([sql]) => sql)).toEqual([
        "BEGIN",
        "ROLLBACK",
      ]);
      expect(harness.transaction.release).toHaveBeenCalledTimes(1);
    },
  );

  it("rejeita chaveamento existente antes de consultar ou criar jogadores", async () => {
    const harness = createHarness(16, 15);

    await expect(
      harness.service.generateBracket(TOURNAMENT_ID, ACTOR_DISCORD_ID),
    ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });

    expect(harness.registrations.countApproved).not.toHaveBeenCalled();
    expect(harness.registrations.listApprovedForUpdate).not.toHaveBeenCalled();
    expect(harness.tournaments.addPlayers).not.toHaveBeenCalled();
    expect(harness.matches.createBracket).not.toHaveBeenCalled();
    expect(harness.transaction.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      "ROLLBACK",
    ]);
    expect(harness.transaction.release).toHaveBeenCalledTimes(1);
  });
});
