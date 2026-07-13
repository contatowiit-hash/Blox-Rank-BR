import 'dotenv/config';
import { loadDatabaseMigrationEnv } from '../config/env.js';
import { closeDatabasePool, createDatabasePool } from './pool.js';
import { runMigrations } from './run-migrations.js';

async function main(): Promise<void> {
  const env = loadDatabaseMigrationEnv();

  const pool = createDatabasePool({
    databaseUrl: env.DATABASE_URL,
    poolMax: 1,
    ssl: env.DATABASE_SSL,
    statementTimeoutMs: 120_000,
    queryTimeoutMs: 150_000,
    lockTimeoutMs: 15_000,
    idleInTransactionSessionTimeoutMs: 180_000,
  });
  try {
    const result = await runMigrations(pool);
    process.stdout.write(
      `${JSON.stringify({
        level: 'info',
        event: 'database_migrations_completed',
        applied: result.applied,
        alreadyApplied: result.alreadyApplied,
      })}\n`,
    );
  } finally {
    await closeDatabasePool(pool);
  }
}

main().catch(() => {
  // Não imprime a exceção do driver para evitar que uma URL de conexão vaze no log.
  process.stderr.write(
    `${JSON.stringify({ level: 'error', event: 'database_migrations_failed' })}\n`,
  );
  process.exitCode = 1;
});
