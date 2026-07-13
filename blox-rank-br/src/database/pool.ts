import { Pool, type PoolClient, type PoolConfig, type QueryResult } from 'pg';

export type Queryable = Pick<Pool, 'query'>;

export interface CreateDatabasePoolOptions {
  databaseUrl: string;
  ssl?: PoolConfig['ssl'];
  poolMax?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  queryTimeoutMs?: number;
  lockTimeoutMs?: number;
  idleInTransactionSessionTimeoutMs?: number;
  applicationName?: string;
  onUnexpectedError?: (error: Error) => void;
}

function safeTimeout(value: number | undefined, fallback: number, name: string): number {
  const timeout = value ?? fallback;
  if (!Number.isSafeInteger(timeout) || timeout < 500 || timeout > 300_000) {
    throw new RangeError(`${name} deve ser um inteiro entre 500 e 300000 ms.`);
  }
  return timeout;
}

export function createDatabasePool(options: CreateDatabasePoolOptions): Pool {
  const databaseUrl = options.databaseUrl.trim();
  if (databaseUrl.length === 0) {
    throw new Error('A URL de conexão com o banco não foi configurada.');
  }
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('A URL de conexão com o banco é inválida.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol)) {
    throw new Error('A URL de conexão deve usar PostgreSQL.');
  }
  if ([...parsedDatabaseUrl.searchParams.keys()].some((key) => key.toLowerCase().startsWith('ssl'))) {
    throw new Error('Parâmetros SSL devem ser configurados fora da URL do banco.');
  }

  const max = options.poolMax ?? 10;
  if (!Number.isSafeInteger(max) || max < 1 || max > 100) {
    throw new RangeError('poolMax deve ser um inteiro entre 1 e 100.');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max,
    ssl: options.ssl,
    idleTimeoutMillis: safeTimeout(options.idleTimeoutMs, 30_000, 'idleTimeoutMs'),
    connectionTimeoutMillis: safeTimeout(options.connectionTimeoutMs, 10_000, 'connectionTimeoutMs'),
    statement_timeout: safeTimeout(options.statementTimeoutMs, 15_000, 'statementTimeoutMs'),
    query_timeout: safeTimeout(options.queryTimeoutMs, 20_000, 'queryTimeoutMs'),
    lock_timeout: safeTimeout(options.lockTimeoutMs, 5_000, 'lockTimeoutMs'),
    idle_in_transaction_session_timeout: safeTimeout(
      options.idleInTransactionSessionTimeoutMs,
      30_000,
      'idleInTransactionSessionTimeoutMs',
    ),
    application_name: options.applicationName ?? 'blox-rank-br',
    allowExitOnIdle: false,
  });

  pool.on('error', (error) => {
    if (options.onUnexpectedError !== undefined) {
      options.onUnexpectedError(error);
      return;
    }

    // Não inclui a mensagem do driver: ela pode conter dados da conexão.
    process.stderr.write(
      `${JSON.stringify({ level: 'error', event: 'postgres_idle_client_error' })}\n`,
    );
  });

  return pool;
}

export async function checkDatabaseConnection(queryable: Queryable): Promise<boolean> {
  const result: QueryResult<{ ok: number }> = await queryable.query<{ ok: number }>(
    'SELECT 1 AS ok',
  );
  return result.rows[0]?.ok === 1;
}

export async function closeDatabasePool(pool: Pool): Promise<void> {
  await pool.end();
}

export function isPoolClient(value: Queryable): value is PoolClient {
  return 'release' in value && typeof value.release === 'function';
}
