import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import type {
  AuditLogRepository,
  OutboxRepository,
  RegistrationRepository,
  TournamentRepository,
} from "../src/repositories/index.js";
import { RegistrationService } from "../src/services/registration-service.js";
import type { AuditLog, Registration } from "../src/types/domain.js";

const REGISTRATION_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_ID = "22222222-2222-4222-8222-222222222222";
const AUDIT_ID = "33333333-3333-4333-8333-333333333333";
const ACTOR_ID = "123456789012345678";
const DISCORD_ID = "223456789012345678";
const FIXED_DATE = new Date("2026-07-12T12:00:00.000Z");

const approvedRegistration: Registration = {
  id: REGISTRATION_ID,
  tournamentId: TOURNAMENT_ID,
  robloxUsername: "Jogador_BR",
  discordUserId: DISCORD_ID,
  discordUsername: "jogador",
  level: 2_550,
  bountyHonor: 30_000_000,
  faction: "pirate",
  platform: "pc",
  mainFruit: "Dragon",
  status: "approved",
  rejectionReason: null,
  approvedByDiscordId: ACTOR_ID,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
};

const pendingRegistration: Registration = {
  ...approvedRegistration,
  status: "pending",
  approvedByDiscordId: null,
};

describe("RegistrationService.createByStaff", () => {
  it("grava a inscrição, a auditoria e os avisos na mesma transação", async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const createRegistration = vi.fn(async () => pendingRegistration);
    const getCurrent = vi.fn(async () => ({ id: TOURNAMENT_ID }));
    const getByIdForUpdate = vi.fn(async () => ({
      id: TOURNAMENT_ID,
      name: "Blox Rank BR",
      status: "registrations_open" as const,
      maxPlayers: 16,
      createdAt: FIXED_DATE,
      updatedAt: FIXED_DATE,
    }));
    const createAudit = vi.fn(async () => ({
      id: AUDIT_ID,
      action: "registration.created_by_staff",
      actorDiscordId: ACTOR_ID,
      targetId: REGISTRATION_ID,
      metadata: {},
      createdAt: FIXED_DATE,
    }));
    const enqueue = vi.fn(async (input: { deduplicationKey?: string | null }) => ({
      id: input.deduplicationKey,
    }));
    const service = new RegistrationService({
      pool,
      registrations: { create: createRegistration } as unknown as RegistrationRepository,
      tournaments: { getCurrent, getByIdForUpdate } as unknown as TournamentRepository,
      auditLogs: { create: createAudit } as unknown as AuditLogRepository,
      outbox: { enqueue } as unknown as OutboxRepository,
      registrationsChannelId: "323456789012345678",
      logsChannelId: "423456789012345678",
      participantRoleId: "523456789012345678",
    });

    const result = await service.createByStaff({
      roblox_username: "Jogador_BR",
      discord_user_id: DISCORD_ID,
      discord_username: "jogador",
      level: 2_550,
      bounty_honor: 30_000_000,
      faction: "pirate",
      platform: "pc",
      main_fruit: "Dragon",
    }, ACTOR_ID, TOURNAMENT_ID);

    expect(result).toBe(pendingRegistration);
    expect(createRegistration).toHaveBeenCalledWith(expect.objectContaining({
      tournamentId: TOURNAMENT_ID,
      discordUserId: DISCORD_ID,
      robloxUsername: "Jogador_BR",
    }), client);
    expect(createAudit).toHaveBeenCalledWith({
      action: "registration.created_by_staff",
      actorDiscordId: ACTOR_ID,
      targetId: REGISTRATION_ID,
      metadata: { tournamentId: TOURNAMENT_ID, discordUserId: DISCORD_ID },
    }, client);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "registration.created",
      channelId: "323456789012345678",
      deduplicationKey: `registration.created:${REGISTRATION_ID}`,
    }), client);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "administrative.action",
      channelId: "423456789012345678",
      deduplicationKey: `registration.created_by_staff:${REGISTRATION_ID}`,
      payload: expect.objectContaining({ action: "registration.created_by_staff" }),
    }), client);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("faz rollback se a auditoria da criação não puder ser registrada", async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const enqueue = vi.fn(async () => ({ id: "outbox" }));
    const service = new RegistrationService({
      pool,
      registrations: {
        create: vi.fn(async () => pendingRegistration),
      } as unknown as RegistrationRepository,
      tournaments: {
        getCurrent: vi.fn(async () => ({ id: TOURNAMENT_ID })),
        getByIdForUpdate: vi.fn(async () => ({
          id: TOURNAMENT_ID,
          name: "Blox Rank BR",
          status: "registrations_open",
        })),
      } as unknown as TournamentRepository,
      auditLogs: {
        create: vi.fn(async () => { throw new Error("audit unavailable"); }),
      } as unknown as AuditLogRepository,
      outbox: { enqueue } as unknown as OutboxRepository,
      registrationsChannelId: "323456789012345678",
      logsChannelId: "423456789012345678",
      participantRoleId: "523456789012345678",
    });

    await expect(service.createByStaff({
      roblox_username: "Jogador_BR",
      discord_user_id: DISCORD_ID,
      discord_username: "jogador",
      level: 2_550,
      bounty_honor: 30_000_000,
      faction: "pirate",
      platform: "pc",
      main_fruit: "Dragon",
    }, ACTOR_ID, TOURNAMENT_ID)).rejects.toThrow("audit unavailable");

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledWith(false);
  });

  it("não inscreve na edição errada se o torneio atual mudar durante o formulário", async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const createRegistration = vi.fn();
    const service = new RegistrationService({
      pool: { connect: vi.fn(async () => client) } as unknown as Pool,
      registrations: { create: createRegistration } as unknown as RegistrationRepository,
      tournaments: {
        getCurrent: vi.fn(async () => ({ id: "44444444-4444-4444-8444-444444444444" })),
      } as unknown as TournamentRepository,
      auditLogs: {} as AuditLogRepository,
      outbox: {} as OutboxRepository,
      registrationsChannelId: "323456789012345678",
      logsChannelId: "423456789012345678",
      participantRoleId: "523456789012345678",
    });

    await expect(service.createByStaff({
      roblox_username: "Jogador_BR",
      discord_user_id: DISCORD_ID,
      discord_username: "jogador",
      level: 2_550,
      bounty_honor: 30_000_000,
      faction: "pirate",
      platform: "pc",
      main_fruit: "Dragon",
    }, ACTOR_ID, TOURNAMENT_ID)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "O torneio atual mudou enquanto o formulário estava aberto. Execute /inscrever novamente.",
    });

    expect(createRegistration).not.toHaveBeenCalled();
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "ROLLBACK"]);
    expect(release).toHaveBeenCalledWith(false);
  });
});

describe("RegistrationService.updateStatus", () => {
  it("permite repetir aprovação para reenfileirar o cargo com nova chave idempotente", async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [], rowCount: 0 }));
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    const updateStatus = vi.fn();
    const registrations = {
      getById: vi.fn(async () => approvedRegistration),
      updateStatus,
    } as unknown as RegistrationRepository;
    const auditLog: AuditLog = {
      id: AUDIT_ID,
      action: "registration.participant_role_retry_requested",
      actorDiscordId: ACTOR_ID,
      targetId: REGISTRATION_ID,
      metadata: { status: "approved" },
      createdAt: FIXED_DATE,
    };
    const createAudit = vi.fn(async () => auditLog);
    const enqueue = vi.fn(async (input: { deduplicationKey?: string | null }) => ({
      id: input.deduplicationKey,
    }));
    const service = new RegistrationService({
      pool,
      registrations,
      tournaments: {} as TournamentRepository,
      auditLogs: { create: createAudit } as unknown as AuditLogRepository,
      outbox: { enqueue } as unknown as OutboxRepository,
      registrationsChannelId: "323456789012345678",
      logsChannelId: "423456789012345678",
      participantRoleId: "523456789012345678",
    });

    const result = await service.updateStatus(REGISTRATION_ID, { status: "approved" }, ACTOR_ID);

    expect(result).toBe(approvedRegistration);
    expect(updateStatus).not.toHaveBeenCalled();
    expect(createAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "registration.participant_role_retry_requested" }),
      client,
    );
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "registration.participant_role_grant",
        deduplicationKey: `participant-role:${REGISTRATION_ID}:retry:${AUDIT_ID}`,
      }),
      client,
    );
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "COMMIT"]);
    expect(release).toHaveBeenCalledWith(false);
  });
});

describe("RegistrationService.getPendingByDiscordUserId", () => {
  function serviceFor(registration: Registration | null) {
    const getByDiscordUserId = vi.fn(async () => registration);
    const service = new RegistrationService({
      pool: {} as Pool,
      registrations: { getByDiscordUserId } as unknown as RegistrationRepository,
      tournaments: { getCurrent: vi.fn(async () => ({ id: TOURNAMENT_ID })) } as unknown as TournamentRepository,
      auditLogs: {} as AuditLogRepository,
      outbox: {} as OutboxRepository,
      registrationsChannelId: "323456789012345678",
      logsChannelId: "423456789012345678",
      participantRoleId: "523456789012345678",
    });
    return { service, getByDiscordUserId };
  }

  it("encontra a inscrição pendente do usuário no torneio atual", async () => {
    const harness = serviceFor(pendingRegistration);
    await expect(harness.service.getPendingByDiscordUserId(DISCORD_ID)).resolves.toBe(pendingRegistration);
    expect(harness.getByDiscordUserId).toHaveBeenCalledWith(TOURNAMENT_ID, DISCORD_ID);
  });

  it("explica quando a inscrição do usuário já foi analisada", async () => {
    const harness = serviceFor(approvedRegistration);
    await expect(harness.service.getPendingByDiscordUserId(DISCORD_ID)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A inscrição deste jogador já foi analisada.",
    });
  });
});
