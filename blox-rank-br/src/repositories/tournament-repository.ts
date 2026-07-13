import { randomUUID } from 'node:crypto';
import type { Queryable } from '../database/pool.js';
import type {
  CreateTournamentInput,
  SeededTournamentPlayer,
  Tournament,
  TournamentPlayer,
  TournamentStatus,
} from '../types/domain.js';

interface TournamentRow {
  id: string;
  name: string;
  status: TournamentStatus;
  max_players: number;
  created_at: Date;
  updated_at: Date;
}

interface TournamentPlayerRow {
  tournament_id: string;
  registration_id: string;
  seed: number;
  eliminated: boolean;
  final_position: number | null;
}

function mapTournament(row: TournamentRow): Tournament {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    maxPlayers: row.max_players,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTournamentPlayer(row: TournamentPlayerRow): TournamentPlayer {
  return {
    tournamentId: row.tournament_id,
    registrationId: row.registration_id,
    seed: row.seed,
    eliminated: row.eliminated,
    finalPosition: row.final_position,
  };
}

export class TournamentRepository {
  public constructor(private readonly defaultQueryable: Queryable) {}

  private db(override?: Queryable): Queryable {
    return override ?? this.defaultQueryable;
  }

  public async create(
    input: CreateTournamentInput,
    queryable?: Queryable,
  ): Promise<Tournament> {
    const result = await this.db(queryable).query<TournamentRow>(
      `INSERT INTO tournaments (id, name, status, max_players)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [randomUUID(), input.name, input.status ?? 'draft', input.maxPlayers],
    );
    return mapTournament(result.rows[0]!);
  }

  public async getById(id: string, queryable?: Queryable): Promise<Tournament | null> {
    const result = await this.db(queryable).query<TournamentRow>(
      'SELECT * FROM tournaments WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapTournament(row);
  }

  public async getCurrent(queryable?: Queryable): Promise<Tournament | null> {
    const result = await this.db(queryable).query<TournamentRow>(
      `SELECT *
       FROM tournaments
       WHERE status IN ('registrations_open', 'registrations_closed', 'active', 'finished')
       ORDER BY CASE status
         WHEN 'active' THEN 1
         WHEN 'registrations_closed' THEN 2
         WHEN 'registrations_open' THEN 3
         WHEN 'finished' THEN 4
         ELSE 5
       END,
       updated_at DESC,
       id DESC
       LIMIT 1`,
    );
    const row = result.rows[0];
    return row === undefined ? null : mapTournament(row);
  }

  public async getByIdForUpdate(
    id: string,
    queryable?: Queryable,
  ): Promise<Tournament | null> {
    const result = await this.db(queryable).query<TournamentRow>(
      'SELECT * FROM tournaments WHERE id = $1 FOR UPDATE',
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapTournament(row);
  }

  public async updateStatus(
    id: string,
    status: TournamentStatus,
    queryable?: Queryable,
  ): Promise<Tournament | null> {
    const result = await this.db(queryable).query<TournamentRow>(
      `UPDATE tournaments
       SET status = $2
       WHERE id = $1
       RETURNING *`,
      [id, status],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapTournament(row);
  }

  public async addPlayers(
    tournamentId: string,
    players: readonly SeededTournamentPlayer[],
    queryable?: Queryable,
  ): Promise<TournamentPlayer[]> {
    if (players.length === 0) {
      return [];
    }

    const registrationIds = players.map((player) => player.registrationId);
    const seeds = players.map((player) => player.seed);
    const result = await this.db(queryable).query<TournamentPlayerRow>(
      `WITH requested AS (
         SELECT registration_id, seed
         FROM UNNEST($2::UUID[], $3::INTEGER[]) AS requested(registration_id, seed)
       ),
       eligible AS (
         SELECT requested.registration_id, requested.seed
         FROM requested
         INNER JOIN registrations
           ON registrations.id = requested.registration_id
          AND registrations.tournament_id = $1
          AND registrations.status = 'approved'
       )
       INSERT INTO tournament_players (tournament_id, registration_id, seed)
       SELECT $1, eligible.registration_id, eligible.seed
       FROM eligible
       WHERE (SELECT COUNT(*) FROM eligible) = (SELECT COUNT(*) FROM requested)
       ORDER BY eligible.seed
       RETURNING *`,
      [tournamentId, registrationIds, seeds],
    );

    if (result.rows.length !== players.length) {
      throw new Error('Nem todos os jogadores estão aprovados para entrar no torneio.');
    }
    return result.rows.map(mapTournamentPlayer);
  }

  public async listPlayers(
    tournamentId: string,
    queryable?: Queryable,
  ): Promise<TournamentPlayer[]> {
    const result = await this.db(queryable).query<TournamentPlayerRow>(
      `SELECT *
       FROM tournament_players
       WHERE tournament_id = $1
       ORDER BY seed ASC`,
      [tournamentId],
    );
    return result.rows.map(mapTournamentPlayer);
  }

  public async setPlayerEliminated(
    tournamentId: string,
    registrationId: string,
    finalPosition: number | null,
    queryable?: Queryable,
  ): Promise<TournamentPlayer | null> {
    const result = await this.db(queryable).query<TournamentPlayerRow>(
      `UPDATE tournament_players
       SET eliminated = TRUE, final_position = $3
       WHERE tournament_id = $1 AND registration_id = $2
       RETURNING *`,
      [tournamentId, registrationId, finalPosition],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapTournamentPlayer(row);
  }

  public async setChampion(
    tournamentId: string,
    registrationId: string,
    queryable?: Queryable,
  ): Promise<TournamentPlayer | null> {
    const result = await this.db(queryable).query<TournamentPlayerRow>(
      `UPDATE tournament_players
       SET eliminated = FALSE, final_position = 1
       WHERE tournament_id = $1 AND registration_id = $2
       RETURNING *`,
      [tournamentId, registrationId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapTournamentPlayer(row);
  }
}
