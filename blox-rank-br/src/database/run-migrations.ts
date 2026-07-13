import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { migrations, type Migration } from './migrations/index.js';

const MIGRATION_LOCK_NAME = 'blox-rank-br:database-migrations';

interface AppliedMigrationRow {
  id: string;
  checksum: string;
}

export interface MigrationRunResult {
  applied: string[];
  alreadyApplied: string[];
}

export class MigrationChecksumMismatchError extends Error {
  public constructor(public readonly migrationId: string) {
    super(`A migration ${migrationId} foi alterada depois de aplicada.`);
    this.name = 'MigrationChecksumMismatchError';
  }
}

class MigrationRollbackError extends AggregateError {}

function checksumFor(migration: Migration): string {
  return createHash('sha256').update(migration.sql, 'utf8').digest('hex');
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(100) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT schema_migrations_id_check CHECK (CHAR_LENGTH(BTRIM(id)) > 0),
      CONSTRAINT schema_migrations_name_check CHECK (CHAR_LENGTH(BTRIM(name)) > 0)
    )
  `);
}

async function applyMigration(client: PoolClient, migration: Migration): Promise<boolean> {
  const checksum = checksumFor(migration);

  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '15s'");
    const existing = await client.query<AppliedMigrationRow>(
      'SELECT id, checksum FROM schema_migrations WHERE id = $1 FOR UPDATE',
      [migration.id],
    );

    const applied = existing.rows[0];
    if (applied !== undefined) {
      if (applied.checksum !== checksum) {
        throw new MigrationChecksumMismatchError(migration.id);
      }
      await client.query('COMMIT');
      return false;
    }

    await client.query(migration.sql);
    await client.query(
      `INSERT INTO schema_migrations (id, name, checksum)
       VALUES ($1, $2, $3)`,
      [migration.id, migration.name, checksum],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      throw new MigrationRollbackError(
        [error, rollbackError],
        'A migration falhou e o rollback não pôde ser confirmado.',
      );
    }
    throw error;
  }
}

export async function runMigrations(pool: Pool): Promise<MigrationRunResult> {
  const client = await pool.connect();
  let lockAcquired = false;
  let destroyClient = false;

  try {
    await ensureMigrationTable(client);
    await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
      MIGRATION_LOCK_NAME,
    ]);
    lockAcquired = true;

    const applied: string[] = [];
    const alreadyApplied: string[] = [];
    for (const migration of migrations) {
      if (await applyMigration(client, migration)) {
        applied.push(migration.id);
      } else {
        alreadyApplied.push(migration.id);
      }
    }

    return { applied, alreadyApplied };
  } catch (error) {
    if (error instanceof MigrationRollbackError) {
      destroyClient = true;
    }
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
          MIGRATION_LOCK_NAME,
        ]);
      } catch {
        destroyClient = true;
      }
    }
    client.release(destroyClient);
  }
}
