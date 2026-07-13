import { randomUUID } from 'node:crypto';
import type { Queryable } from '../database/pool.js';
import type {
  DiscordOutboxMessage,
  DiscordOutboxStatus,
  EnqueueDiscordOutboxInput,
  JsonObject,
} from '../types/domain.js';

interface OutboxRow {
  id: string;
  event_type: string;
  channel_id: string;
  payload: JsonObject;
  status: DiscordOutboxStatus;
  attempts: number;
  max_attempts: number;
  available_at: Date;
  locked_at: Date | null;
  locked_by: string | null;
  processed_at: Date | null;
  last_error: string | null;
  deduplication_key: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapOutboxMessage(row: OutboxRow): DiscordOutboxMessage {
  return {
    id: row.id,
    eventType: row.event_type,
    channelId: row.channel_id,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    availableAt: row.available_at,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    processedAt: row.processed_at,
    lastError: row.last_error,
    deduplicationKey: row.deduplication_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safePositiveInteger(value: number, name: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} deve ser um inteiro entre 1 e ${maximum}.`);
  }
  return value;
}

function redactError(message: string): string {
  return message
    .replace(/\b(?:postgres(?:ql)?|https?|wss?):\/\/\S+/giu, '[url removida]')
    .replace(/\b(?:bearer|token|secret|password|api[_-]?key)\s*[:=]\s*\S+/giu, '[credencial removida]')
    .replace(/[\u0000-\u001F\u007F]+/gu, ' ')
    .trim()
    .slice(0, 500) || 'Falha ao publicar mensagem.';
}

export class OutboxRepository {
  public constructor(private readonly defaultQueryable: Queryable) {}

  private db(override?: Queryable): Queryable {
    return override ?? this.defaultQueryable;
  }

  public async enqueue(
    input: EnqueueDiscordOutboxInput,
    queryable?: Queryable,
  ): Promise<DiscordOutboxMessage> {
    const id = randomUUID();
    const maxAttempts = input.maxAttempts ?? 100;
    safePositiveInteger(maxAttempts, 'maxAttempts', 100);

    const result = await this.db(queryable).query<OutboxRow>(
      `INSERT INTO discord_outbox (
         id, event_type, channel_id, payload, max_attempts,
         available_at, deduplication_key
       )
       VALUES ($1, $2, $3, $4::JSONB, $5, $6, $7)
       ON CONFLICT (deduplication_key) WHERE deduplication_key IS NOT NULL
       DO NOTHING
       RETURNING *`,
      [
        id,
        input.eventType,
        input.channelId,
        JSON.stringify(input.payload),
        maxAttempts,
        input.availableAt ?? new Date(),
        input.deduplicationKey ?? null,
      ],
    );
    const inserted = result.rows[0];
    if (inserted !== undefined) {
      return mapOutboxMessage(inserted);
    }

    const deduplicationKey = input.deduplicationKey;
    if (deduplicationKey === undefined || deduplicationKey === null) {
      throw new Error('A mensagem do Discord não pôde ser adicionada à fila.');
    }
    const existing = await this.db(queryable).query<OutboxRow>(
      'SELECT * FROM discord_outbox WHERE deduplication_key = $1',
      [deduplicationKey],
    );
    const row = existing.rows[0];
    if (row === undefined) {
      throw new Error('A mensagem idempotente do Discord não foi encontrada.');
    }
    return mapOutboxMessage(row);
  }

  public async claimPending(
    limit: number,
    workerId: string,
    queryable?: Queryable,
    staleAfterMs = 300_000,
  ): Promise<DiscordOutboxMessage[]> {
    safePositiveInteger(limit, 'limit', 100);
    safePositiveInteger(staleAfterMs, 'staleAfterMs', 86_400_000);
    const trimmedWorkerId = workerId.trim();
    if (trimmedWorkerId.length < 1 || trimmedWorkerId.length > 100) {
      throw new RangeError('workerId deve conter entre 1 e 100 caracteres.');
    }

    const result = await this.db(queryable).query<OutboxRow>(
      `WITH exhausted AS (
         UPDATE discord_outbox
         SET status = 'failed',
             payload = '{}'::JSONB,
             locked_at = NULL,
             locked_by = NULL,
             last_error = COALESCE(last_error, 'Limite de tentativas atingido.')
         WHERE status IN ('pending', 'processing')
           AND attempts >= max_attempts
           AND (status = 'pending' OR locked_at <= NOW() - ($3 * INTERVAL '1 millisecond'))
         RETURNING id
       ),
       candidates AS (
         SELECT id
         FROM discord_outbox
         WHERE attempts < max_attempts
           AND (
             (status = 'pending' AND available_at <= NOW())
             OR (
               status = 'processing'
               AND locked_at <= NOW() - ($3 * INTERVAL '1 millisecond')
             )
           )
         ORDER BY available_at ASC, created_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1
       )
       UPDATE discord_outbox
       SET status = 'processing',
           attempts = attempts + 1,
           locked_at = NOW(),
           locked_by = $2,
           last_error = NULL
       WHERE id IN (SELECT id FROM candidates)
       RETURNING *`,
      [limit, trimmedWorkerId, staleAfterMs],
    );
    return result.rows.map(mapOutboxMessage);
  }

  public async markProcessed(
    id: string,
    workerId: string,
    queryable?: Queryable,
  ): Promise<DiscordOutboxMessage | null> {
    const trimmedWorkerId = workerId.trim();
    if (trimmedWorkerId.length < 1 || trimmedWorkerId.length > 100) {
      throw new RangeError('workerId deve conter entre 1 e 100 caracteres.');
    }
    const result = await this.db(queryable).query<OutboxRow>(
      `UPDATE discord_outbox
       SET status = 'processed',
           payload = '{}'::JSONB,
           processed_at = NOW(),
           locked_at = NULL,
           locked_by = NULL,
           last_error = NULL
       WHERE id = $1 AND status = 'processing' AND locked_by = $2
       RETURNING *`,
      [id, trimmedWorkerId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapOutboxMessage(row);
  }

  public async markFailed(
    id: string,
    workerId: string,
    errorMessage: string,
    retryDelayMs = 30_000,
    queryable?: Queryable,
  ): Promise<DiscordOutboxMessage | null> {
    safePositiveInteger(retryDelayMs, 'retryDelayMs', 86_400_000);
    const trimmedWorkerId = workerId.trim();
    if (trimmedWorkerId.length < 1 || trimmedWorkerId.length > 100) {
      throw new RangeError('workerId deve conter entre 1 e 100 caracteres.');
    }
    const result = await this.db(queryable).query<OutboxRow>(
      `UPDATE discord_outbox
       SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
           payload = CASE WHEN attempts >= max_attempts THEN '{}'::JSONB ELSE payload END,
           available_at = NOW() + ($4 * INTERVAL '1 millisecond'),
           locked_at = NULL,
           locked_by = NULL,
           last_error = $3
       WHERE id = $1 AND status = 'processing' AND locked_by = $2
       RETURNING *`,
      [id, trimmedWorkerId, redactError(errorMessage), retryDelayMs],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapOutboxMessage(row);
  }
}
