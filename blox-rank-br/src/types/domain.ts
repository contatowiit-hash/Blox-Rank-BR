export const REGISTRATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const FACTIONS = ['pirate', 'marine'] as const;
export type Faction = (typeof FACTIONS)[number];

export const PLATFORMS = ['pc', 'mobile', 'console'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const TOURNAMENT_STATUSES = [
  'draft',
  'registrations_open',
  'registrations_closed',
  'active',
  'finished',
] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const MATCH_STATUSES = ['pending', 'scheduled', 'completed', 'cancelled'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const DISCORD_OUTBOX_STATUSES = [
  'pending',
  'processing',
  'processed',
  'failed',
] as const;
export type DiscordOutboxStatus = (typeof DISCORD_OUTBOX_STATUSES)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface Registration {
  id: string;
  tournamentId: string;
  robloxUsername: string;
  discordUserId: string;
  discordUsername: string;
  level: number;
  bountyHonor: number;
  faction: Faction;
  platform: Platform;
  mainFruit: string;
  status: RegistrationStatus;
  rejectionReason: string | null;
  approvedByDiscordId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRegistrationInput {
  tournamentId: string;
  robloxUsername: string;
  discordUserId: string;
  discordUsername: string;
  level: number;
  bountyHonor: number;
  faction: Faction;
  platform: Platform;
  mainFruit: string;
}

export interface UpdateRegistrationStatusInput {
  status: Exclude<RegistrationStatus, 'pending'>;
  actorDiscordId: string;
  rejectionReason?: string | null;
}

export interface RegistrationListOptions {
  tournamentId?: string;
  status?: RegistrationStatus;
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  maxPlayers: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTournamentInput {
  name: string;
  maxPlayers: number;
  status?: TournamentStatus;
}

export interface TournamentPlayer {
  tournamentId: string;
  registrationId: string;
  seed: number;
  eliminated: boolean;
  finalPosition: number | null;
}

export interface SeededTournamentPlayer {
  registrationId: string;
  seed: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  round: number;
  bracketPosition: number;
  playerOneRegistrationId: string | null;
  playerTwoRegistrationId: string | null;
  playerOneScore: number | null;
  playerTwoScore: number | null;
  winnerRegistrationId: string | null;
  status: MatchStatus;
  scheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBracketMatchInput {
  round: number;
  bracketPosition: number;
  playerOneRegistrationId?: string | null;
  playerTwoRegistrationId?: string | null;
  status?: Extract<MatchStatus, 'pending' | 'scheduled'>;
  scheduledAt?: Date | null;
}

export interface CompleteMatchInput {
  playerOneScore: number;
  playerTwoScore: number;
  winnerRegistrationId: string;
}

export interface BracketPlayer {
  registrationId: string;
  robloxUsername: string;
  seed: number;
}

export interface BracketMatch extends Match {
  playerOne: BracketPlayer | null;
  playerTwo: BracketPlayer | null;
  winner: BracketPlayer | null;
}

export interface AuditLog {
  id: string;
  action: string;
  actorDiscordId: string;
  targetId: string | null;
  metadata: JsonObject;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  action: string;
  actorDiscordId: string;
  targetId?: string | null;
  metadata?: JsonObject;
}

export interface DiscordOutboxMessage {
  id: string;
  eventType: string;
  channelId: string;
  payload: JsonObject;
  status: DiscordOutboxStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  processedAt: Date | null;
  lastError: string | null;
  deduplicationKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueDiscordOutboxInput {
  eventType: string;
  channelId: string;
  payload: JsonObject;
  maxAttempts?: number;
  availableAt?: Date;
  deduplicationKey?: string | null;
}
