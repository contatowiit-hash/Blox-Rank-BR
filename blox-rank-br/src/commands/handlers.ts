import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type ColorResolvable,
  type Interaction,
} from "discord.js";
import { ZodError } from "zod";
import type { ApplicationContext } from "../application-context.js";
import type { AppEnv } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  matchResultSchema,
  updateRegistrationStatusSchema,
  uuidSchema,
} from "../utils/schemas.js";
import { sanitizeErrorName, sanitizeText } from "../utils/sanitize.js";
import { DISCORD_COMMAND_NAMES } from "./definitions.js";
import {
  DISCORD_THEME,
  NO_DISCORD_MENTIONS,
  createBracketEmbeds,
  createFeedbackEmbed,
  createPendingRegistrationEmbeds,
  createPingEmbed,
} from "./embeds.js";

export type DiscordLogValue = string | number | boolean | null;
export type DiscordLogFields = Readonly<Record<string, DiscordLogValue>>;

export interface SanitizedDiscordLogger {
  info(fields: DiscordLogFields, message: string): void;
  warn(fields: DiscordLogFields, message: string): void;
  error(fields: DiscordLogFields, message: string): void;
}

export interface DiscordCommandHandlerOptions {
  readonly env: AppEnv;
  readonly context: ApplicationContext;
  readonly healthCheck: () => Promise<boolean>;
  readonly logger: SanitizedDiscordLogger;
}

export type DiscordInteractionHandler = (interaction: Interaction) => Promise<void>;

const ADMIN_COMMANDS = new Set<string>([
  DISCORD_COMMAND_NAMES.registrations,
  DISCORD_COMMAND_NAMES.approve,
  DISCORD_COMMAND_NAMES.reject,
  DISCORD_COMMAND_NAMES.result,
]);

const PUBLIC_COMMANDS = new Set<string>([
  DISCORD_COMMAND_NAMES.bracket,
  DISCORD_COMMAND_NAMES.ping,
]);

function safeCommandName(name: string): string {
  return sanitizeText(name).slice(0, 32) || "unknown";
}

function memberHasRole(interaction: ChatInputCommandInteraction, roleId: string): boolean {
  const roles = interaction.member?.roles;
  if (roles === undefined) {
    return false;
  }
  if (Array.isArray(roles)) {
    return roles.includes(roleId);
  }
  return roles.cache.has(roleId);
}

async function editFeedback(
  interaction: ChatInputCommandInteraction,
  title: string,
  message: string,
  color: ColorResolvable = DISCORD_THEME.darkBlue,
): Promise<void> {
  await interaction.editReply({
    embeds: [createFeedbackEmbed(title, message, color)],
    allowedMentions: NO_DISCORD_MENTIONS,
  });
}

async function replyOutsideConfiguredGuild(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.reply({
    embeds: [
      createFeedbackEmbed(
        "Servidor não autorizado",
        "Este comando só pode ser usado no servidor oficial do Blox Rank BR.",
        DISCORD_THEME.purple,
      ),
    ],
    allowedMentions: NO_DISCORD_MENTIONS,
    flags: MessageFlags.Ephemeral,
  });
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof ZodError) {
    return "Confira os códigos e valores informados e tente novamente.";
  }
  return "Não foi possível concluir esta ação agora. Tente novamente em instantes.";
}

function commandFailureFields(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Record<string, DiscordLogValue> {
  const fields: Record<string, DiscordLogValue> = {
    event: "discord.command.failed",
    errorName: sanitizeErrorName(error),
    commandName: safeCommandName(interaction.commandName),
    interactionId: interaction.id,
    actorDiscordId: interaction.user.id,
    guildId: interaction.guildId,
  };
  if (error instanceof AppError) {
    fields.errorCode = error.code;
  }
  return fields;
}

async function respondToCommandFailure(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const payload = {
    embeds: [
      createFeedbackEmbed(
        "Não foi possível concluir",
        publicErrorMessage(error),
        DISCORD_THEME.purple,
      ),
    ],
    allowedMentions: NO_DISCORD_MENTIONS,
  };

  if (interaction.deferred) {
    await interaction.editReply(payload);
    return;
  }
  if (interaction.replied) {
    await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function handlePendingRegistrations(
  interaction: ChatInputCommandInteraction,
  context: ApplicationContext,
): Promise<void> {
  const result = await context.services.registrations.list({
    page: 1,
    limit: 100,
    status: "pending",
  });
  const batches = Array.from(
    { length: Math.max(1, Math.ceil(result.items.length / 25)) },
    (_, index) => result.items.slice(index * 25, index * 25 + 25),
  );
  const content =
    result.total > result.items.length
      ? `Mostrando as primeiras ${result.items.length} de ${result.total} inscrições pendentes.`
      : undefined;

  await interaction.editReply({
    ...(content === undefined ? {} : { content }),
    embeds: createPendingRegistrationEmbeds(batches[0]!),
    allowedMentions: NO_DISCORD_MENTIONS,
  });
  for (const batch of batches.slice(1)) {
    await interaction.followUp({
      embeds: createPendingRegistrationEmbeds(batch),
      allowedMentions: NO_DISCORD_MENTIONS,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleApproval(
  interaction: ChatInputCommandInteraction,
  context: ApplicationContext,
): Promise<void> {
  const registrationId = uuidSchema.parse(interaction.options.getString("inscricao", true));
  const registration = await context.services.registrations.updateStatus(
    registrationId,
    updateRegistrationStatusSchema.parse({ status: "approved" }),
    interaction.user.id,
  );

  await editFeedback(
    interaction,
    "Inscrição aprovada",
    `A inscrição de ${registration.robloxUsername} foi aprovada. O cargo de participante será entregue automaticamente.`,
    DISCORD_THEME.purple,
  );
}

async function handleRejection(
  interaction: ChatInputCommandInteraction,
  context: ApplicationContext,
): Promise<void> {
  const registrationId = uuidSchema.parse(interaction.options.getString("inscricao", true));
  const rejectionReason = interaction.options.getString("motivo", true);
  const input = updateRegistrationStatusSchema.parse({
    status: "rejected",
    rejection_reason: rejectionReason,
  });
  const registration = await context.services.registrations.updateStatus(
    registrationId,
    input,
    interaction.user.id,
  );

  await editFeedback(
    interaction,
    "Inscrição recusada",
    `A inscrição de ${registration.robloxUsername} foi recusada e o motivo foi registrado.`,
    DISCORD_THEME.purple,
  );
}

async function handleMatchResult(
  interaction: ChatInputCommandInteraction,
  context: ApplicationContext,
): Promise<void> {
  const matchId = uuidSchema.parse(interaction.options.getString("partida", true));
  const resultInput = matchResultSchema.parse({
    player_one_score: interaction.options.getInteger("placar_jogador_1", true),
    player_two_score: interaction.options.getInteger("placar_jogador_2", true),
  });
  const result = await context.services.matches.recordResult(
    matchId,
    resultInput,
    interaction.user.id,
  );

  await editFeedback(
    interaction,
    result.idempotent ? "Resultado já registrado" : "Resultado registrado",
    result.idempotent
      ? "Este mesmo placar já estava salvo. Nenhuma alteração foi necessária."
      : "O placar foi salvo e o chaveamento foi atualizado.",
    DISCORD_THEME.purple,
  );
}

async function handleBracket(
  interaction: ChatInputCommandInteraction,
  context: ApplicationContext,
): Promise<void> {
  const bracket = await context.services.tournaments.getCurrentBracket();
  await interaction.editReply({
    embeds: createBracketEmbeds(bracket.tournament.name, bracket.matches),
    allowedMentions: NO_DISCORD_MENTIONS,
  });
}

async function handlePing(
  interaction: ChatInputCommandInteraction,
  healthCheck: () => Promise<boolean>,
  logger: SanitizedDiscordLogger,
): Promise<void> {
  let apiHealthy = false;
  try {
    apiHealthy = (await healthCheck()) === true;
  } catch (error: unknown) {
    logger.warn(
      {
        event: "discord.ping.health_check_failed",
        errorName: sanitizeErrorName(error),
        interactionId: interaction.id,
      },
      "O health check solicitado pelo Discord falhou",
    );
  }

  await interaction.editReply({
    embeds: [createPingEmbed(interaction.client.ws.ping, apiHealthy)],
    allowedMentions: NO_DISCORD_MENTIONS,
  });
}

async function executeKnownCommand(
  interaction: ChatInputCommandInteraction,
  options: DiscordCommandHandlerOptions,
): Promise<void> {
  switch (interaction.commandName) {
    case DISCORD_COMMAND_NAMES.registrations:
      await handlePendingRegistrations(interaction, options.context);
      return;
    case DISCORD_COMMAND_NAMES.approve:
      await handleApproval(interaction, options.context);
      return;
    case DISCORD_COMMAND_NAMES.reject:
      await handleRejection(interaction, options.context);
      return;
    case DISCORD_COMMAND_NAMES.result:
      await handleMatchResult(interaction, options.context);
      return;
    case DISCORD_COMMAND_NAMES.bracket:
      await handleBracket(interaction, options.context);
      return;
    case DISCORD_COMMAND_NAMES.ping:
      await handlePing(interaction, options.healthCheck, options.logger);
      return;
    default:
      await editFeedback(
        interaction,
        "Comando não reconhecido",
        "Atualize o Discord e tente novamente.",
        DISCORD_THEME.purple,
      );
  }
}

export function createDiscordInteractionHandler(
  options: DiscordCommandHandlerOptions,
): DiscordInteractionHandler {
  return async (interaction: Interaction): Promise<void> => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (!interaction.inGuild() || interaction.guildId !== options.env.DISCORD_GUILD_ID) {
      try {
        await replyOutsideConfiguredGuild(interaction);
      } catch (error: unknown) {
        options.logger.warn(
          {
            event: "discord.command.wrong_guild_reply_failed",
            errorName: sanitizeErrorName(error),
            interactionId: interaction.id,
          },
          "Não foi possível responder a uma interação fora do servidor configurado",
        );
      }
      return;
    }

    const commandName = interaction.commandName;
    const isAdministrative = ADMIN_COMMANDS.has(commandName);
    const isPublic = PUBLIC_COMMANDS.has(commandName);

    try {
      if (!isAdministrative && !isPublic) {
        await interaction.reply({
          embeds: [
            createFeedbackEmbed(
              "Comando não reconhecido",
              "Atualize o Discord e tente novamente.",
              DISCORD_THEME.purple,
            ),
          ],
          allowedMentions: NO_DISCORD_MENTIONS,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (isAdministrative) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        if (!memberHasRole(interaction, options.env.DISCORD_STAFF_ROLE_ID)) {
          await editFeedback(
            interaction,
            "Sem permissão",
            "Somente a equipe do torneio pode usar este comando.",
            DISCORD_THEME.purple,
          );
          return;
        }
      } else {
        await interaction.deferReply();
      }

      await executeKnownCommand(interaction, options);
    } catch (error: unknown) {
      options.logger.error(
        commandFailureFields(interaction, error),
        "Um comando do Discord falhou",
      );
      try {
        await respondToCommandFailure(interaction, error);
      } catch (replyError: unknown) {
        options.logger.warn(
          {
            event: "discord.command.failure_reply_failed",
            errorName: sanitizeErrorName(replyError),
            commandName: safeCommandName(interaction.commandName),
            interactionId: interaction.id,
          },
          "Não foi possível enviar a resposta segura de erro do comando",
        );
      }
    }
  };
}
