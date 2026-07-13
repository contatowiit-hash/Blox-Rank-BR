import { z } from "zod";
import { sanitizeText } from "./sanitize.js";

export const uuidSchema = z.string().uuid("deve ser um UUID válido");
export const discordIdSchema = z.string().regex(/^\d{17,20}$/, "deve ser um ID válido do Discord");

const cleanLimitedText = (minimum: number, maximum: number, label: string) =>
  z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(minimum, `${label} é obrigatório`).max(maximum, `${label} é muito longo`));

export const createRegistrationSchema = z
  .object({
    roblox_username: z
      .string()
      .transform((value) => sanitizeText(value))
      .pipe(
        z
          .string()
          .min(3, "O nome do Roblox deve ter ao menos 3 caracteres")
          .max(20, "O nome do Roblox deve ter no máximo 20 caracteres")
          .regex(/^[A-Za-z0-9_]+$/, "Use apenas letras, números e _ no nome do Roblox"),
      ),
    discord_user_id: discordIdSchema,
    discord_username: cleanLimitedText(2, 64, "O nome do Discord"),
    level: z.number().int().min(1).max(10_000),
    bounty_honor: z.number().int().min(0).max(1_000_000_000),
    faction: z.enum(["pirate", "marine"]),
    platform: z.enum(["pc", "mobile", "console"]),
    main_fruit: cleanLimitedText(1, 80, "A fruta principal"),
  })
  .strict();

export const registrationStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const updateRegistrationStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("approved") }).strict(),
  z
    .object({
      status: z.literal("rejected"),
      rejection_reason: cleanLimitedText(3, 500, "O motivo"),
    })
    .strict(),
]);

export const registrationListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    status: registrationStatusSchema.optional(),
    tournament_id: uuidSchema.optional(),
  })
  .strict();

export const idParamsSchema = z.object({ id: uuidSchema }).strict();

export const matchResultSchema = z
  .object({
    player_one_score: z.number().int().min(0).max(100),
    player_two_score: z.number().int().min(0).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.player_one_score === value.player_two_score) {
      context.addIssue({
        code: "custom",
        path: ["player_two_score"],
        message: "A partida precisa ter um vencedor; empate não é permitido",
      });
    }
  });

export const actorDiscordIdSchema = discordIdSchema;

export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;
export type UpdateRegistrationStatusInput = z.infer<typeof updateRegistrationStatusSchema>;
export type RegistrationListQuery = z.infer<typeof registrationListQuerySchema>;
export type MatchResultInput = z.infer<typeof matchResultSchema>;
