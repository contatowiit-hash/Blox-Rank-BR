import { z } from "zod";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

function sanitizeText(value: string): string {
  return value.normalize("NFKC").replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
}

const cleanLimitedText = (minimum: number, maximum: number, label: string) =>
  z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(minimum, `${label} \u00e9 obrigat\u00f3rio`).max(maximum, `${label} \u00e9 muito longo`));

export const uuidSchema = z.string().uuid("deve ser um UUID v\u00e1lido");
export const discordIdSchema = z.string().regex(/^\d{17,20}$/, "deve ser um ID v\u00e1lido do Discord");
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const factionSchema = z.enum(["pirate", "marine"]);
export const platformSchema = z.enum(["pc", "mobile", "console"]);
export const registrationStatusSchema = z.enum(["pending", "approved", "rejected"]);
export const tournamentStatusSchema = z.enum([
  "draft",
  "registrations_open",
  "registrations_closed",
  "active",
  "finished",
]);
export const matchStatusSchema = z.enum(["pending", "scheduled", "completed", "cancelled"]);

export const registrationInputSchema = z
  .object({
    roblox_username: z
      .string()
      .transform(sanitizeText)
      .pipe(
        z
          .string()
          .min(3, "O nome do Roblox deve ter ao menos 3 caracteres")
          .max(20, "O nome do Roblox deve ter no m\u00e1ximo 20 caracteres")
          .regex(/^[A-Za-z0-9_]+$/, "Use apenas letras, n\u00fameros e _ no nome do Roblox"),
      ),
    discord_user_id: discordIdSchema,
    discord_username: cleanLimitedText(2, 64, "O nome do Discord"),
    level: z.number().int().min(1).max(10_000),
    bounty_honor: z.number().int().min(0).max(1_000_000_000),
    faction: factionSchema,
    platform: platformSchema,
    main_fruit: cleanLimitedText(1, 80, "A fruta principal"),
  })
  .strict();

export const backendRegistrationSchema = z
  .object({
    id: uuidSchema,
    tournament_id: uuidSchema,
    roblox_username: z.string().min(3).max(20),
    discord_user_id: discordIdSchema,
    discord_username: z.string().min(1).max(64),
    level: z.number().int().min(1).max(10_000),
    bounty_honor: z.number().int().min(0).max(1_000_000_000),
    faction: factionSchema,
    platform: platformSchema,
    main_fruit: z.string().min(1).max(80),
    status: registrationStatusSchema,
    rejection_reason: z.string().min(1).max(500).nullable(),
    approved_by_discord_id: discordIdSchema.nullable(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict();

export const registrationReceiptSchema = z
  .object({
    id: uuidSchema,
    tournament_id: uuidSchema,
    roblox_username: z.string().min(3).max(20),
    status: z.literal("pending"),
    created_at: isoDateTimeSchema,
  })
  .strict();

export const tournamentSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(120),
    status: tournamentStatusSchema,
    max_players: z.number().int().min(2).max(1_024),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict();

export const bracketPlayerSchema = z
  .object({
    registration_id: uuidSchema,
    roblox_username: z.string().min(3).max(20),
    seed: z.number().int().min(1).max(16),
  })
  .strict();

export const bracketMatchSchema = z
  .object({
    id: uuidSchema,
    round: z.number().int().min(1).max(4),
    bracket_position: z.number().int().min(1).max(8),
    player_one: bracketPlayerSchema.nullable(),
    player_two: bracketPlayerSchema.nullable(),
    player_one_score: z.number().int().min(0).max(100).nullable(),
    player_two_score: z.number().int().min(0).max(100).nullable(),
    winner: bracketPlayerSchema.nullable(),
    status: matchStatusSchema,
    scheduled_at: isoDateTimeSchema.nullable(),
  })
  .strict();

export const publicBracketSchema = z
  .object({
    tournament: tournamentSchema,
    matches: z.array(bracketMatchSchema).max(15),
  })
  .strict();

export const paginationSchema = z
  .object({
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().min(0),
    total_pages: z.number().int().min(0),
  })
  .strict();

export const publicParticipantSchema = z
  .object({
    id: uuidSchema,
    tournament_id: uuidSchema,
    roblox_username: z.string().min(3).max(20),
    level: z.number().int().min(1).max(10_000),
    bounty_honor: z.number().int().min(0).max(1_000_000_000),
    faction: factionSchema,
    platform: platformSchema,
    main_fruit: z.string().min(1).max(80),
  })
  .strict();

export const publicSocialConfigSchema = z
  .object({
    discord_url: z.url().nullable(),
    tiktok_url: z.url().nullable(),
    youtube_url: z.url().nullable(),
  })
  .strict();

export const healthSchema = z.object({ status: z.enum(["ok", "unavailable"]) }).strict();

export const apiIssueSchema = z
  .object({
    field: z.string().min(1).max(200),
    message: z.string().min(1).max(500),
  })
  .strict();

export const apiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(1_000),
        requestId: z.string().min(1).max(200).optional(),
        issues: z.array(apiIssueSchema).max(100).optional(),
      })
      .strict(),
  })
  .strict();

export const registrationEnvelopeSchema = z.object({ data: backendRegistrationSchema }).strict();
export const tournamentEnvelopeSchema = z.object({ data: tournamentSchema }).strict();
export const bracketEnvelopeSchema = z.object({ data: publicBracketSchema }).strict();
export const registrationListEnvelopeSchema = z
  .object({ data: z.array(backendRegistrationSchema).max(100), pagination: paginationSchema })
  .strict();
export const registrationReceiptEnvelopeSchema = z.object({ data: registrationReceiptSchema }).strict();
export const publicParticipantsEnvelopeSchema = z
  .object({ data: z.array(publicParticipantSchema).max(16) })
  .strict();
export const publicConfigEnvelopeSchema = z.object({ data: publicSocialConfigSchema }).strict();
