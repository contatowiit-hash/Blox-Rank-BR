import { randomUUID } from 'node:crypto';
import type { Queryable } from '../database/pool.js';
import type {
  BracketMatch,
  BracketPlayer,
  CompleteMatchInput,
  CreateBracketMatchInput,
  Match,
  MatchStatus,
} from '../types/domain.js';

interface MatchRow {
  id: string;
  tournament_id: string;
  round: number;
  bracket_position: number;
  player_one_registration_id: string | null;
  player_two_registration_id: string | null;
  player_one_score: number | null;
  player_two_score: number | null;
  winner_registration_id: string | null;
  status: MatchStatus;
  scheduled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface BracketMatchRow extends MatchRow {
  player_one_roblox_username: string | null;
  player_one_seed: number | null;
  player_two_roblox_username: string | null;
  player_two_seed: number | null;
  winner_roblox_username: string | null;
  winner_seed: number | null;
}

interface CountRow {
  count: string;
}

function mapMatch(row: MatchRow): Match {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    round: row.round,
    bracketPosition: row.bracket_position,
    playerOneRegistrationId: row.player_one_registration_id,
    playerTwoRegistrationId: row.player_two_registration_id,
    playerOneScore: row.player_one_score,
    playerTwoScore: row.player_two_score,
    winnerRegistrationId: row.winner_registration_id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBracketPlayer(
  registrationId: string | null,
  robloxUsername: string | null,
  seed: number | null,
): BracketPlayer | null {
  if (registrationId === null || robloxUsername === null || seed === null) {
    return null;
  }
  return { registrationId, robloxUsername, seed };
}

function mapBracketMatch(row: BracketMatchRow): BracketMatch {
  return {
    ...mapMatch(row),
    playerOne: mapBracketPlayer(
      row.player_one_registration_id,
      row.player_one_roblox_username,
      row.player_one_seed,
    ),
    playerTwo: mapBracketPlayer(
      row.player_two_registration_id,
      row.player_two_roblox_username,
      row.player_two_seed,
    ),
    winner: mapBracketPlayer(
      row.winner_registration_id,
      row.winner_roblox_username,
      row.winner_seed,
    ),
  };
}

export class BracketAlreadyExistsError extends Error {
  public constructor(public readonly tournamentId: string) {
    super('O chaveamento deste torneio já foi criado.');
    this.name = 'BracketAlreadyExistsError';
  }
}

export class MatchRepository {
  public constructor(private readonly defaultQueryable: Queryable) {}

  private db(override?: Queryable): Queryable {
    return override ?? this.defaultQueryable;
  }

  public async countByTournament(
    tournamentId: string,
    queryable?: Queryable,
  ): Promise<number> {
    const result = await this.db(queryable).query<CountRow>(
      'SELECT COUNT(*)::TEXT AS count FROM matches WHERE tournament_id = $1',
      [tournamentId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  public async createBracket(
    tournamentId: string,
    matches: readonly CreateBracketMatchInput[],
    queryable?: Queryable,
  ): Promise<Match[]> {
    if (matches.length === 0) {
      throw new RangeError('O chaveamento precisa conter ao menos uma partida.');
    }

    const values: unknown[] = [tournamentId];
    const rows = matches.map((match) => {
      const firstParameter = values.length + 1;
      values.push(
        randomUUID(),
        match.round,
        match.bracketPosition,
        match.playerOneRegistrationId ?? null,
        match.playerTwoRegistrationId ?? null,
        match.status ?? 'pending',
        match.scheduledAt ?? null,
      );
      return `(
        $${firstParameter}::UUID,
        $${firstParameter + 1}::INTEGER,
        $${firstParameter + 2}::INTEGER,
        $${firstParameter + 3}::UUID,
        $${firstParameter + 4}::UUID,
        $${firstParameter + 5}::VARCHAR,
        $${firstParameter + 6}::TIMESTAMPTZ
      )`;
    });

    const result = await this.db(queryable).query<MatchRow>(
      `WITH bracket_guard AS (
         SELECT 1
         WHERE NOT EXISTS (
           SELECT 1 FROM matches WHERE tournament_id = $1
         )
       ),
       new_matches (
         id, round, bracket_position, player_one_registration_id,
         player_two_registration_id, status, scheduled_at
       ) AS (
         VALUES ${rows.join(',')}
       )
       INSERT INTO matches (
         id, tournament_id, round, bracket_position,
         player_one_registration_id, player_two_registration_id,
         status, scheduled_at
       )
       SELECT
         new_matches.id, $1, new_matches.round, new_matches.bracket_position,
         new_matches.player_one_registration_id, new_matches.player_two_registration_id,
         new_matches.status, new_matches.scheduled_at
       FROM new_matches
       CROSS JOIN bracket_guard
       RETURNING *`,
      values,
    );

    if (result.rows.length !== matches.length) {
      throw new BracketAlreadyExistsError(tournamentId);
    }
    return result.rows
      .map(mapMatch)
      .sort((left, right) => left.round - right.round || left.bracketPosition - right.bracketPosition);
  }

  public async getById(id: string, queryable?: Queryable): Promise<Match | null> {
    const result = await this.db(queryable).query<MatchRow>(
      'SELECT * FROM matches WHERE id = $1',
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMatch(row);
  }

  public async getByIdForUpdate(id: string, queryable?: Queryable): Promise<Match | null> {
    const result = await this.db(queryable).query<MatchRow>(
      'SELECT * FROM matches WHERE id = $1 FOR UPDATE',
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMatch(row);
  }

  public async getByPositionForUpdate(
    tournamentId: string,
    round: number,
    bracketPosition: number,
    queryable?: Queryable,
  ): Promise<Match | null> {
    const result = await this.db(queryable).query<MatchRow>(
      `SELECT *
       FROM matches
       WHERE tournament_id = $1 AND round = $2 AND bracket_position = $3
       FOR UPDATE`,
      [tournamentId, round, bracketPosition],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMatch(row);
  }

  public async complete(
    id: string,
    input: CompleteMatchInput,
    queryable?: Queryable,
  ): Promise<Match | null> {
    const result = await this.db(queryable).query<MatchRow>(
      `UPDATE matches
       SET player_one_score = $2,
           player_two_score = $3,
           winner_registration_id = $4,
           status = 'completed'
       WHERE id = $1
         AND status IN ('pending', 'scheduled')
         AND player_one_registration_id IS NOT NULL
         AND player_two_registration_id IS NOT NULL
         AND $4 IN (player_one_registration_id, player_two_registration_id)
       RETURNING *`,
      [id, input.playerOneScore, input.playerTwoScore, input.winnerRegistrationId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMatch(row);
  }

  public async setNextSlot(
    id: string,
    slot: 'playerOne' | 'playerTwo',
    registrationId: string,
    queryable?: Queryable,
  ): Promise<Match | null> {
    const column =
      slot === 'playerOne' ? 'player_one_registration_id' : 'player_two_registration_id';
    const result = await this.db(queryable).query<MatchRow>(
      `UPDATE matches
       SET ${column} = $2
       WHERE id = $1
         AND status IN ('pending', 'scheduled')
         AND (${column} IS NULL OR ${column} = $2)
       RETURNING *`,
      [id, registrationId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapMatch(row);
  }

  public async listBracket(
    tournamentId: string,
    queryable?: Queryable,
  ): Promise<BracketMatch[]> {
    const result = await this.db(queryable).query<BracketMatchRow>(
      `SELECT
         matches.*,
         player_one.roblox_username AS player_one_roblox_username,
         player_one_tournament.seed AS player_one_seed,
         player_two.roblox_username AS player_two_roblox_username,
         player_two_tournament.seed AS player_two_seed,
         winner.roblox_username AS winner_roblox_username,
         winner_tournament.seed AS winner_seed
       FROM matches
       LEFT JOIN registrations AS player_one
         ON player_one.id = matches.player_one_registration_id
       LEFT JOIN tournament_players AS player_one_tournament
         ON player_one_tournament.tournament_id = matches.tournament_id
        AND player_one_tournament.registration_id = matches.player_one_registration_id
       LEFT JOIN registrations AS player_two
         ON player_two.id = matches.player_two_registration_id
       LEFT JOIN tournament_players AS player_two_tournament
         ON player_two_tournament.tournament_id = matches.tournament_id
        AND player_two_tournament.registration_id = matches.player_two_registration_id
       LEFT JOIN registrations AS winner
         ON winner.id = matches.winner_registration_id
       LEFT JOIN tournament_players AS winner_tournament
         ON winner_tournament.tournament_id = matches.tournament_id
        AND winner_tournament.registration_id = matches.winner_registration_id
       WHERE matches.tournament_id = $1
       ORDER BY matches.round ASC, matches.bracket_position ASC`,
      [tournamentId],
    );
    return result.rows.map(mapBracketMatch);
  }
}
