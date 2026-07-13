import type { Pool, PoolClient } from 'pg';

export type TransactionIsolationLevel =
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export interface TransactionOptions {
  isolationLevel?: TransactionIsolationLevel;
  readOnly?: boolean;
}

export async function withTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const client = await pool.connect();
  let transactionStarted = false;
  let destroyClient = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;

    if (options.isolationLevel !== undefined) {
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
    }
    if (options.readOnly === true) {
      await client.query('SET TRANSACTION READ ONLY');
    }

    const result = await operation(client);
    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        destroyClient = true;
        throw new AggregateError(
          [error, rollbackError],
          'A transação falhou e o rollback também não pôde ser confirmado.',
        );
      }
    }
    throw error;
  } finally {
    client.release(destroyClient);
  }
}
