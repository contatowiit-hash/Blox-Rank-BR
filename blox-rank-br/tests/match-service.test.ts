import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type {
  AuditLogRepository,
  MatchRepository,
  OutboxRepository,
  RegistrationRepository,
  TournamentRepository,
} from "../src/repositories/index.js";
import { MatchService } from "../src/services/match-service.js";
import type {
  CompleteMatchInput,
  CreateAuditLogInput,
  EnqueueDiscordOutboxInput,
  Match,
  Registration,
  Tournament,
  TournamentPlayer,
} from "../src/types/domain.js";

const TOURNAMENT_ID = "30000000-0000-4000-8000-000000000001";
const MATCH_ID = "40000000-0000-4000-8000-000000000001";
const NEXT_MATCH_ID = "40000000-0000-4000-8000-000000000002";
const PLAYER_ONE_ID = "50000000-0000-4000-8000-000000000001";
const PLAYER_TWO_ID = "50000000-0000-4000-8000-000000000002";
const ACTOR_DISCORD_ID = "123456789012345678";
const FIXED_DATE = new Date("2026-07-12T12:00:00.000Z");

const activeTournament: Tournament = {
  id: TOURNAMENT_ID,
  name: "Blox Rank BR",
  status: "active",
  maxPlayers: 16,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
};

function createMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: MATCH_ID,
    tournamentId: TOURNAMENT_ID,
    round: 1,
    bracketPosition: 1,
    playerOneRegistrationId: PLAYER_ONE_ID,
    playerTwoRegistrationId: PLAYER_TWO_ID,
    playerOneScore: null,
    playerTwoScore: null,
    winnerRegistrationId: null,
    status: "pending",
    scheduledAt: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...overrides,
  };
}

function createTransactionFake() {
  const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client);
  const pool = { connect } as unknown as Pool;
  return { pool, client, query, release };
}

function createHarness(lockedMatch: Match) {
  const transaction = createTransactionFake();
  const nextMatch = createMatch({
    id: NEXT_MATCH_ID,
    round: Math.min(lockedMatch.round + 1, 4),
    bracketPosition: Math.ceil(lockedMatch.bracketPosition / 2),
    playerOneRegistrationId: null,
    playerTwoRegistrationId: null,
  });

  const matches = {
    getByIdForUpdate: vi.fn(async (_id: string, _client: PoolClient) => lockedMatch),
    complete: vi.fn(
      async (_id: string, input: CompleteMatchInput, _client: PoolClient): Promise<Match> => ({
        ...lockedMatch,
        playerOneScore: input.playerOneScore,
        playerTwoScore: input.playerTwoScore,
        winnerRegistrationId: input.winnerRegistrationId,
        status: "completed",
      }),
    ),
    getByPositionForUpdate: vi.fn(
      async (
        _tournamentId: string,
        _round: number,
        _bracketPosition: number,
        _client: PoolClient,
      ) => nextMatch,
    ),
    setNextSlot: vi.fn(
      async (
        _id: string,
        slot: "playerOne" | "playerTwo",
        registrationId: string,
        _client: PoolClient,
      ): Promise<Match> => ({
        ...nextMatch,
        ...(slot === "playerOne"
          ? { playerOneRegistrationId: registrationId }
          : { playerTwoRegistrationId: registrationId }),
      }),
    ),
  };
  const tournaments = {
    getById: vi.fn(async (_id: string, _client: PoolClient) => activeTournament),
    setPlayerEliminated: vi.fn(
      async (
        tournamentId: string,
        registrationId: string,
        finalPosition: number | null,
        _client: PoolClient,
      ): Promise<TournamentPlayer> => ({
        tournamentId,
        registrationId,
        seed: 16,
        eliminated: true,
        finalPosition,
      }),
    ),
    getByIdForUpdate: vi.fn(async (_id: string, _client: PoolClient) => activeTournament),
    setChampion: vi.fn(
      async (
        tournamentId: string,
        registrationId: string,
        _client: PoolClient,
      ): Promise<TournamentPlayer> => ({
        tournamentId,
        registrationId,
        seed: 1,
        eliminated: false,
        finalPosition: 1,
      }),
    ),
    updateStatus: vi.fn(
      async (_id: string, _status: string, _client: PoolClient): Promise<Tournament> => ({
        ...activeTournament,
        status: "finished",
      }),
    ),
  };
  const auditLogs = {
    create: vi.fn(async (_input: CreateAuditLogInput, _client: PoolClient) => ({})),
  };
  const outbox = {
    enqueue: vi.fn(async (_input: EnqueueDiscordOutboxInput, _client: PoolClient) => ({})),
  };
  const registrations = {
    getById: vi.fn(async (id: string): Promise<Registration> => ({
      id, tournamentId: TOURNAMENT_ID, robloxUsername: id === PLAYER_ONE_ID ? "JogadorUm" : "JogadorDois",
      discordUserId: "123456789012345678", discordUsername: "jogador", level: 2550,
      bountyHonor: 1_000_000, faction: "pirate", platform: "pc", mainFruit: "Portal",
      status: "approved", rejectionReason: null, approvedByDiscordId: ACTOR_DISCORD_ID,
      createdAt: FIXED_DATE, updatedAt: FIXED_DATE,
    })),
  };

  const service = new MatchService({
    pool: transaction.pool,
    matches: matches as unknown as MatchRepository,
    registrations: registrations as unknown as RegistrationRepository,
    tournaments: tournaments as unknown as TournamentRepository,
    auditLogs: auditLogs as unknown as AuditLogRepository,
    outbox: outbox as unknown as OutboxRepository,
    logsChannelId: "345678901234567890",
  });

  return {
    service,
    transaction,
    nextMatch,
    matches,
    tournaments,
    auditLogs,
    outbox,
  };
}

describe("MatchService.recordResult", () => {
  it("avan\u00e7a o vencedor para o slot correto e marca a posi\u00e7\u00e3o do eliminado", async () => {
    const match = createMatch({ round: 1, bracketPosition: 2 });
    const harness = createHarness(match);

    const result = await harness.service.recordResult(
      MATCH_ID,
      { player_one_score: 1, player_two_score: 3 },
      ACTOR_DISCORD_ID,
    );

    expect(result.idempotent).toBe(false);
    expect(result.match).toMatchObject({
      status: "completed",
      winnerRegistrationId: PLAYER_TWO_ID,
      playerOneScore: 1,
      playerTwoScore: 3,
    });
    const client = harness.transaction.client;
    expect(harness.matches.complete).toHaveBeenCalledWith(
      MATCH_ID,
      {
        playerOneScore: 1,
        playerTwoScore: 3,
        winnerRegistrationId: PLAYER_TWO_ID,
      },
      client,
    );
    expect(harness.tournaments.setPlayerEliminated).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      PLAYER_ONE_ID,
      9,
      client,
    );
    expect(harness.matches.getByPositionForUpdate).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      2,
      1,
      client,
    );
    expect(harness.matches.setNextSlot).toHaveBeenCalledWith(
      NEXT_MATCH_ID,
      "playerTwo",
      PLAYER_TWO_ID,
      client,
    );
    expect(harness.auditLogs.create.mock.calls[0]?.[1]).toBe(client);
    expect(harness.outbox.enqueue.mock.calls[0]?.[1]).toBe(client);
    expect(harness.transaction.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(harness.transaction.release).toHaveBeenCalledTimes(1);
  });

  it("na final registra campe\u00e3o, vice e encerra o torneio", async () => {
    const match = createMatch({ round: 4, bracketPosition: 1 });
    const harness = createHarness(match);

    const result = await harness.service.recordResult(
      MATCH_ID,
      { player_one_score: 4, player_two_score: 2 },
      ACTOR_DISCORD_ID,
    );

    const client = harness.transaction.client;
    expect(result).toMatchObject({
      idempotent: false,
      match: { status: "completed", winnerRegistrationId: PLAYER_ONE_ID },
    });
    expect(harness.tournaments.setPlayerEliminated).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      PLAYER_TWO_ID,
      2,
      client,
    );
    expect(harness.tournaments.getByIdForUpdate).toHaveBeenCalledWith(TOURNAMENT_ID, client);
    expect(harness.tournaments.setChampion).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      PLAYER_ONE_ID,
      client,
    );
    expect(harness.tournaments.updateStatus).toHaveBeenCalledWith(
      TOURNAMENT_ID,
      "finished",
      client,
    );
    expect(harness.matches.getByPositionForUpdate).not.toHaveBeenCalled();
    expect(harness.matches.setNextSlot).not.toHaveBeenCalled();
    expect(harness.auditLogs.create).toHaveBeenCalledTimes(1);
    expect(harness.transaction.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
  });

  it("trata repeti\u00e7\u00e3o id\u00eantica como idempotente sem nova auditoria", async () => {
    const completedMatch = createMatch({
      status: "completed",
      playerOneScore: 4,
      playerTwoScore: 2,
      winnerRegistrationId: PLAYER_ONE_ID,
    });
    const harness = createHarness(completedMatch);

    const result = await harness.service.recordResult(
      MATCH_ID,
      { player_one_score: 4, player_two_score: 2 },
      ACTOR_DISCORD_ID,
    );

    expect(result).toEqual({ match: completedMatch, idempotent: true });
    expect(harness.matches.complete).not.toHaveBeenCalled();
    expect(harness.tournaments.getById).not.toHaveBeenCalled();
    expect(harness.tournaments.setPlayerEliminated).not.toHaveBeenCalled();
    expect(harness.auditLogs.create).not.toHaveBeenCalled();
    expect(harness.outbox.enqueue).not.toHaveBeenCalled();
    expect(harness.transaction.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(harness.transaction.release).toHaveBeenCalledTimes(1);
  });
});
