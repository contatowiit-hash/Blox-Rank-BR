export const initialSchemaSql = String.raw`
CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY,
  tournament_id UUID NOT NULL,
  roblox_username VARCHAR(20) NOT NULL,
  discord_user_id VARCHAR(64) NOT NULL,
  discord_username VARCHAR(64) NOT NULL,
  level INTEGER NOT NULL,
  bounty_honor INTEGER NOT NULL,
  faction VARCHAR(16) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  main_fruit VARCHAR(80) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(500),
  approved_by_discord_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT registrations_roblox_username_format_check
    CHECK (roblox_username = BTRIM(roblox_username)
      AND roblox_username ~ '^[A-Za-z0-9_]{3,20}$'),
  CONSTRAINT registrations_discord_user_id_check
    CHECK (discord_user_id ~ '^[0-9]{17,20}$'),
  CONSTRAINT registrations_discord_username_check
    CHECK (discord_username = BTRIM(discord_username)
      AND CHAR_LENGTH(discord_username) BETWEEN 1 AND 64),
  CONSTRAINT registrations_level_check CHECK (level > 0),
  CONSTRAINT registrations_bounty_honor_check CHECK (bounty_honor >= 0),
  CONSTRAINT registrations_faction_check CHECK (faction IN ('pirate', 'marine')),
  CONSTRAINT registrations_platform_check CHECK (platform IN ('pc', 'mobile', 'console')),
  CONSTRAINT registrations_main_fruit_check
    CHECK (main_fruit = BTRIM(main_fruit) AND CHAR_LENGTH(main_fruit) BETWEEN 1 AND 80),
  CONSTRAINT registrations_status_check CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT registrations_approved_by_check CHECK (
    approved_by_discord_id IS NULL OR approved_by_discord_id ~ '^[0-9]{17,20}$'
  ),
  CONSTRAINT registrations_status_details_check CHECK (
    (status = 'pending' AND rejection_reason IS NULL AND approved_by_discord_id IS NULL)
    OR (status = 'approved' AND rejection_reason IS NULL AND approved_by_discord_id IS NOT NULL)
    OR (status = 'rejected' AND rejection_reason IS NOT NULL
      AND CHAR_LENGTH(BTRIM(rejection_reason)) > 0 AND approved_by_discord_id IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft',
  max_players INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tournaments_name_check
    CHECK (name = BTRIM(name) AND CHAR_LENGTH(name) BETWEEN 1 AND 120),
  CONSTRAINT tournaments_status_check CHECK (
    status IN ('draft', 'registrations_open', 'registrations_closed', 'active', 'finished')
  ),
  CONSTRAINT tournaments_max_players_check CHECK (max_players BETWEEN 2 AND 1024)
);

CREATE INDEX IF NOT EXISTS tournaments_status_updated_at_idx
  ON tournaments (status, updated_at DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_one_current_uidx
  ON tournaments ((1))
  WHERE status IN ('registrations_open', 'registrations_closed', 'active');

ALTER TABLE registrations
  ADD CONSTRAINT registrations_tournament_fk
  FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_tournament_discord_user_id_uidx
  ON registrations (tournament_id, discord_user_id)
  WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS registrations_tournament_roblox_username_ci_uidx
  ON registrations (tournament_id, LOWER(roblox_username))
  WHERE status IN ('pending', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS registrations_tournament_id_id_uidx
  ON registrations (tournament_id, id);
CREATE INDEX IF NOT EXISTS registrations_tournament_status_created_at_idx
  ON registrations (tournament_id, status, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS registrations_tournament_bounty_honor_idx
  ON registrations (tournament_id, bounty_honor DESC, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL,
  seed INTEGER NOT NULL,
  eliminated BOOLEAN NOT NULL DEFAULT FALSE,
  final_position INTEGER,
  PRIMARY KEY (tournament_id, registration_id),
  CONSTRAINT tournament_players_seed_check CHECK (seed BETWEEN 1 AND 16),
  CONSTRAINT tournament_players_final_position_check
    CHECK (final_position IS NULL OR final_position > 0),
  CONSTRAINT tournament_players_elimination_position_check
    CHECK (
      final_position IS NULL
      OR (final_position = 1 AND NOT eliminated)
      OR (final_position > 1 AND eliminated)
    ),
  CONSTRAINT tournament_players_registration_fk
    FOREIGN KEY (tournament_id, registration_id)
    REFERENCES registrations(tournament_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_players_tournament_seed_uidx
  ON tournament_players (tournament_id, seed);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_players_winner_uidx
  ON tournament_players (tournament_id, final_position)
  WHERE final_position = 1;
CREATE INDEX IF NOT EXISTS tournament_players_registration_idx
  ON tournament_players (registration_id);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  bracket_position INTEGER NOT NULL,
  player_one_registration_id UUID,
  player_two_registration_id UUID,
  player_one_score INTEGER,
  player_two_score INTEGER,
  winner_registration_id UUID,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT matches_round_check CHECK (round BETWEEN 1 AND 4),
  CONSTRAINT matches_bracket_position_check CHECK (
    bracket_position BETWEEN 1 AND POWER(2, 4 - round)
  ),
  CONSTRAINT matches_players_different_check CHECK (
    player_one_registration_id IS NULL
    OR player_two_registration_id IS NULL
    OR player_one_registration_id <> player_two_registration_id
  ),
  CONSTRAINT matches_scores_check CHECK (
    (player_one_score IS NULL AND player_two_score IS NULL)
    OR (player_one_score BETWEEN 0 AND 100 AND player_two_score BETWEEN 0 AND 100)
  ),
  CONSTRAINT matches_status_check CHECK (status IN ('pending', 'scheduled', 'completed', 'cancelled')),
  CONSTRAINT matches_result_state_check CHECK (
    (
      status <> 'completed'
      AND player_one_score IS NULL
      AND player_two_score IS NULL
      AND winner_registration_id IS NULL
    )
    OR (
      status = 'completed'
      AND player_one_registration_id IS NOT NULL
      AND player_two_registration_id IS NOT NULL
      AND player_one_score IS NOT NULL
      AND player_two_score IS NOT NULL
      AND player_one_score <> player_two_score
      AND winner_registration_id IS NOT NULL
      AND winner_registration_id IN (player_one_registration_id, player_two_registration_id)
      AND (
        (winner_registration_id = player_one_registration_id AND player_one_score > player_two_score)
        OR (winner_registration_id = player_two_registration_id AND player_two_score > player_one_score)
      )
    )
  ),
  CONSTRAINT matches_player_one_tournament_fk
    FOREIGN KEY (tournament_id, player_one_registration_id)
    REFERENCES tournament_players(tournament_id, registration_id) ON DELETE RESTRICT,
  CONSTRAINT matches_player_two_tournament_fk
    FOREIGN KEY (tournament_id, player_two_registration_id)
    REFERENCES tournament_players(tournament_id, registration_id) ON DELETE RESTRICT,
  CONSTRAINT matches_winner_tournament_fk
    FOREIGN KEY (tournament_id, winner_registration_id)
    REFERENCES tournament_players(tournament_id, registration_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS matches_tournament_round_position_uidx
  ON matches (tournament_id, round, bracket_position);
CREATE INDEX IF NOT EXISTS matches_tournament_round_idx
  ON matches (tournament_id, round, bracket_position);
CREATE INDEX IF NOT EXISTS matches_status_scheduled_at_idx
  ON matches (status, scheduled_at)
  WHERE status IN ('pending', 'scheduled');

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  actor_discord_id VARCHAR(64) NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_action_check
    CHECK (action = BTRIM(action) AND CHAR_LENGTH(action) BETWEEN 1 AND 100),
  CONSTRAINT audit_logs_actor_check
    CHECK (actor_discord_id ~ '^[0-9]{17,20}$'),
  CONSTRAINT audit_logs_metadata_object_check CHECK (JSONB_TYPEOF(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS audit_logs_target_created_at_idx
  ON audit_logs (target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_at_idx
  ON audit_logs (actor_discord_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_created_at_idx
  ON audit_logs (action, created_at DESC);

CREATE TABLE IF NOT EXISTS discord_outbox (
  id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  channel_id VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 100,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by VARCHAR(100),
  processed_at TIMESTAMPTZ,
  last_error VARCHAR(500),
  deduplication_key VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT discord_outbox_event_type_check
    CHECK (event_type = BTRIM(event_type) AND CHAR_LENGTH(event_type) BETWEEN 1 AND 100),
  CONSTRAINT discord_outbox_channel_id_check
    CHECK (channel_id ~ '^[0-9]{17,20}$'),
  CONSTRAINT discord_outbox_payload_object_check CHECK (JSONB_TYPEOF(payload) = 'object'),
  CONSTRAINT discord_outbox_status_check
    CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  CONSTRAINT discord_outbox_attempts_check CHECK (attempts >= 0),
  CONSTRAINT discord_outbox_max_attempts_check CHECK (max_attempts BETWEEN 1 AND 100),
  CONSTRAINT discord_outbox_processed_state_check CHECK (
    (status = 'processed' AND processed_at IS NOT NULL)
    OR (status <> 'processed' AND processed_at IS NULL)
  ),
  CONSTRAINT discord_outbox_lock_state_check CHECK (
    (status = 'processing' AND locked_at IS NOT NULL AND locked_by IS NOT NULL)
    OR (status <> 'processing' AND locked_at IS NULL AND locked_by IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS discord_outbox_deduplication_key_uidx
  ON discord_outbox (deduplication_key)
  WHERE deduplication_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS discord_outbox_pending_claim_idx
  ON discord_outbox (available_at, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS discord_outbox_stale_processing_idx
  ON discord_outbox (locked_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION blox_rank_br_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS registrations_set_updated_at ON registrations;
CREATE TRIGGER registrations_set_updated_at
BEFORE UPDATE ON registrations
FOR EACH ROW EXECUTE FUNCTION blox_rank_br_set_updated_at();

DROP TRIGGER IF EXISTS tournaments_set_updated_at ON tournaments;
CREATE TRIGGER tournaments_set_updated_at
BEFORE UPDATE ON tournaments
FOR EACH ROW EXECUTE FUNCTION blox_rank_br_set_updated_at();

DROP TRIGGER IF EXISTS matches_set_updated_at ON matches;
CREATE TRIGGER matches_set_updated_at
BEFORE UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION blox_rank_br_set_updated_at();

DROP TRIGGER IF EXISTS discord_outbox_set_updated_at ON discord_outbox;
CREATE TRIGGER discord_outbox_set_updated_at
BEFORE UPDATE ON discord_outbox
FOR EACH ROW EXECUTE FUNCTION blox_rank_br_set_updated_at();
`;
