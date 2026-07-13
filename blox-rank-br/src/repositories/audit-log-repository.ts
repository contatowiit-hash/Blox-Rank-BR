import { randomUUID } from 'node:crypto';
import type { Queryable } from '../database/pool.js';
import type { AuditLog, CreateAuditLogInput, JsonObject } from '../types/domain.js';

interface AuditLogRow {
  id: string;
  action: string;
  actor_discord_id: string;
  target_id: string | null;
  metadata: JsonObject;
  created_at: Date;
}

function mapAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    action: row.action,
    actorDiscordId: row.actor_discord_id,
    targetId: row.target_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export class AuditLogRepository {
  public constructor(private readonly defaultQueryable: Queryable) {}

  public async create(input: CreateAuditLogInput, queryable?: Queryable): Promise<AuditLog> {
    const result = await (queryable ?? this.defaultQueryable).query<AuditLogRow>(
      `INSERT INTO audit_logs (id, action, actor_discord_id, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5::JSONB)
       RETURNING *`,
      [
        randomUUID(),
        input.action,
        input.actorDiscordId,
        input.targetId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return mapAuditLog(result.rows[0]!);
  }
}
