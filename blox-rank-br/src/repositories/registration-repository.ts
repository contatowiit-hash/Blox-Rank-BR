import { randomUUID } from 'node:crypto';
import type { Queryable } from '../database/pool.js';
import type {
  CreateRegistrationInput,
  PaginatedResult,
  Registration,
  RegistrationListOptions,
  RegistrationStatus,
  UpdateRegistrationStatusInput,
} from '../types/domain.js';

interface RegistrationRow {
  id: string;
  tournament_id: string;
  roblox_username: string;
  discord_user_id: string;
  discord_username: string;
  level: number;
  bounty_honor: number;
  faction: Registration['faction'];
  platform: Registration['platform'];
  main_fruit: string;
  status: RegistrationStatus;
  rejection_reason: string | null;
  approved_by_discord_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface CountRow {
  count: string;
}

function mapRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    robloxUsername: row.roblox_username,
    discordUserId: row.discord_user_id,
    discordUsername: row.discord_username,
    level: row.level,
    bountyHonor: row.bounty_honor,
    faction: row.faction,
    platform: row.platform,
    mainFruit: row.main_fruit,
    status: row.status,
    rejectionReason: row.rejection_reason,
    approvedByDiscordId: row.approved_by_discord_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safePagination(options: RegistrationListOptions): { limit: number; offset: number } {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('limit deve ser um inteiro entre 1 e 100.');
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('offset deve ser um inteiro maior ou igual a zero.');
  }
  return { limit, offset };
}

export class RegistrationRepository {
  public constructor(private readonly defaultQueryable: Queryable) {}

  private db(override?: Queryable): Queryable {
    return override ?? this.defaultQueryable;
  }

  public async create(
    input: CreateRegistrationInput,
    queryable?: Queryable,
  ): Promise<Registration> {
    const result = await this.db(queryable).query<RegistrationRow>(
      `INSERT INTO registrations (
         id, tournament_id, roblox_username, discord_user_id, discord_username, level,
         bounty_honor, faction, platform, main_fruit
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        randomUUID(),
        input.tournamentId,
        input.robloxUsername,
        input.discordUserId,
        input.discordUsername,
        input.level,
        input.bountyHonor,
        input.faction,
        input.platform,
        input.mainFruit,
      ],
    );
    return mapRegistration(result.rows[0]!);
  }

  public async getById(id: string, queryable?: Queryable): Promise<Registration | null> {
    const result = await this.db(queryable).query<RegistrationRow>(
      'SELECT * FROM registrations WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapRegistration(row);
  }

  public async getByDiscordUserId(
    tournamentId: string,
    discordUserId: string,
    queryable?: Queryable,
  ): Promise<Registration | null> {
    const result = await this.db(queryable).query<RegistrationRow>(
      'SELECT * FROM registrations WHERE tournament_id = $1 AND discord_user_id = $2',
      [tournamentId, discordUserId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapRegistration(row);
  }

  public async getByRobloxUsername(
    tournamentId: string,
    robloxUsername: string,
    queryable?: Queryable,
  ): Promise<Registration | null> {
    const result = await this.db(queryable).query<RegistrationRow>(
      `SELECT * FROM registrations
       WHERE tournament_id = $1 AND LOWER(roblox_username) = LOWER($2)`,
      [tournamentId, robloxUsername],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapRegistration(row);
  }

  public async list(
    options: RegistrationListOptions = {},
    queryable?: Queryable,
  ): Promise<PaginatedResult<Registration>> {
    const { limit, offset } = safePagination(options);
    const parameters: unknown[] = [];
    const filters: string[] = [];
    if (options.tournamentId !== undefined) {
      parameters.push(options.tournamentId);
      filters.push(`tournament_id = $${parameters.length}`);
    }
    if (options.status !== undefined) {
      parameters.push(options.status);
      filters.push(`status = $${parameters.length}`);
    }
    const where = filters.length === 0 ? '' : `WHERE ${filters.join(' AND ')}`;

    parameters.push(limit, offset);
    const itemsResult = await this.db(queryable).query<RegistrationRow>(
      `SELECT *
       FROM registrations
       ${where}
       ORDER BY created_at ASC, id ASC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    );

    const countParameters = parameters.slice(0, parameters.length - 2);
    const countResult = await this.db(queryable).query<CountRow>(
      `SELECT COUNT(*)::TEXT AS count FROM registrations ${where}`,
      countParameters,
    );

    return {
      items: itemsResult.rows.map(mapRegistration),
      total: Number(countResult.rows[0]?.count ?? 0),
      limit,
      offset,
    };
  }

  public async countApproved(tournamentId: string, queryable?: Queryable): Promise<number> {
    const result = await this.db(queryable).query<CountRow>(
      `SELECT COUNT(*)::TEXT AS count
       FROM registrations
       WHERE tournament_id = $1 AND status = 'approved'`,
      [tournamentId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async listApprovedForUpdate(
    tournamentId: string,
    limit = 16,
    queryable?: Queryable,
  ): Promise<Registration[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1024) {
      throw new RangeError('limit deve ser um inteiro entre 1 e 1024.');
    }
    const result = await this.db(queryable).query<RegistrationRow>(
      `SELECT *
       FROM registrations
       WHERE tournament_id = $1 AND status = 'approved'
       ORDER BY bounty_honor DESC, created_at ASC, id ASC
       LIMIT $2
       FOR UPDATE`,
      [tournamentId, limit],
    );
    return result.rows.map(mapRegistration);
  }

  public async updateStatus(
    id: string,
    input: UpdateRegistrationStatusInput,
    queryable?: Queryable,
  ): Promise<Registration | null> {
    const rejectionReason = input.status === 'rejected' ? input.rejectionReason ?? null : null;
    const approvedByDiscordId = input.status === 'approved' ? input.actorDiscordId : null;
    const result = await this.db(queryable).query<RegistrationRow>(
      `UPDATE registrations
       SET status = $2,
           rejection_reason = $3,
           approved_by_discord_id = $4
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, input.status, rejectionReason, approvedByDiscordId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapRegistration(row);
  }
}
