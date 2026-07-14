import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ColorResolvable,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
} from "discord.js";
import { ZodError } from "zod";
import type { ApplicationContext } from "../application-context.js";
import type { AppEnv } from "../config/env.js";
import {
  AppError,
  ConflictError,
  ServiceUnavailableError,
  ValidationError,
} from "../utils/errors.js";
import {
  createRegistrationSchema,
  discordIdSchema,
  matchResultSchema,
  updateRegistrationStatusSchema,
  uuidSchema,
} from "../utils/schemas.js";
import { sanitizeErrorName, sanitizeText, truncateText } from "../utils/sanitize.js";
import { DISCORD_COMMAND_NAMES } from "./definitions.js";
import {
  DISCORD_THEME, NO_DISCORD_MENTIONS, REGISTRATION_ACTION_PREFIX,
  createBracketEmbeds, createFeedbackEmbed, createParticipantsEmbeds,
  createPendingRegistrationEmbeds, createPingEmbed, createRegistrationDetailsEmbed,
  createTournamentSummaryEmbed,
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
  DISCORD_COMMAND_NAMES.registrations, DISCORD_COMMAND_NAMES.register,
  DISCORD_COMMAND_NAMES.approve,
  DISCORD_COMMAND_NAMES.reject, DISCORD_COMMAND_NAMES.result,
  DISCORD_COMMAND_NAMES.openRegistrations, DISCORD_COMMAND_NAMES.closeRegistrations,
  DISCORD_COMMAND_NAMES.generateBracket,
]);
const REGISTRATION_CREATE_MODAL_PATTERN = new RegExp(
  `^${REGISTRATION_ACTION_PREFIX}:create:([0-9a-f-]{36}):(\\d{17,20}):(pirate|marine):(pc|mobile|console)$`,
  "iu",
);
const DECIMAL_INTEGER_PATTERN = /^\d+$/u;
const DISCORD_INITIAL_RESPONSE_TIMEOUT_MS = 1_500;
const PUBLIC_COMMANDS = new Set<string>([
  DISCORD_COMMAND_NAMES.tournament, DISCORD_COMMAND_NAMES.participants,
  DISCORD_COMMAND_NAMES.bracket, DISCORD_COMMAND_NAMES.ping,
]);

function memberHasRole(interaction: Interaction, roleId: string): boolean {
  const roles = interaction.member?.roles;
  if (roles === undefined) return false;
  if (Array.isArray(roles)) return roles.includes(roleId);
  return roles.cache.has(roleId);
}

function isConfiguredGuild(interaction: Interaction, env: AppEnv): boolean {
  return interaction.inGuild() && interaction.guildId === env.DISCORD_GUILD_ID;
}

function publicErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof ZodError) {
    return sanitizeText(error.issues[0]?.message ?? "Confira os dados informados e tente novamente.");
  }
  return "Não foi possível concluir esta ação agora. Tente novamente em instantes.";
}

function parseDecimalInteger(value: string, label: string): number {
  const normalized = sanitizeText(value);
  if (!DECIMAL_INTEGER_PATTERN.test(normalized)) {
    throw new ValidationError(`${label} deve conter apenas números inteiros.`);
  }
  return Number(normalized);
}

async function beforeDiscordResponseDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new ServiceUnavailableError(
        "O sistema demorou para consultar o torneio. Execute /inscrever novamente.",
      ));
    }, DISCORD_INITIAL_RESPONSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function editFeedback(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction,
  title: string, message: string, color: ColorResolvable = DISCORD_THEME.darkBlue): Promise<void> {
  await interaction.editReply({ embeds: [createFeedbackEmbed(title, message, color)], allowedMentions: NO_DISCORD_MENTIONS });
}

async function fail(interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction, error: unknown): Promise<void> {
  const payload = { embeds: [createFeedbackEmbed("Não foi possível concluir", publicErrorMessage(error), DISCORD_THEME.purple)], allowedMentions: NO_DISCORD_MENTIONS };
  if (interaction.deferred) await interaction.editReply(payload);
  else if (interaction.replied) await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function logFailure(options: DiscordCommandHandlerOptions, interaction: Interaction, error: unknown): void {
  options.logger.error({ event: "discord.interaction.failed", errorName: sanitizeErrorName(error),
    interactionId: interaction.id, actorDiscordId: interaction.user.id, guildId: interaction.guildId },
  "Uma interação do Discord falhou");
}

async function handleAutocomplete(interaction: AutocompleteInteraction, options: DiscordCommandHandlerOptions): Promise<void> {
  if (!isConfiguredGuild(interaction, options.env) || !memberHasRole(interaction, options.env.DISCORD_STAFF_ROLE_ID)) {
    await interaction.respond([]); return;
  }
  const focused = interaction.options.getFocused(true);
  if (interaction.commandName === DISCORD_COMMAND_NAMES.result && focused.name === "partida") {
    const query = sanitizeText(String(focused.value)).toLocaleLowerCase("pt-BR");
    const bracket = await options.context.services.tournaments.getCurrentBracket();
    const choices = bracket.matches.filter((match) => ["pending", "scheduled"].includes(match.status)
      && match.playerOne !== null && match.playerTwo !== null).map((match) => ({
        name: truncateText(`${match.playerOne!.robloxUsername} x ${match.playerTwo!.robloxUsername} • rodada ${match.round} • ${match.status} • ${match.playerOneScore ?? 0}x${match.playerTwoScore ?? 0}`, 100),
        value: match.id,
      })).filter((choice) => query === "" || choice.name.toLocaleLowerCase("pt-BR").includes(query)).slice(0, 25);
    await interaction.respond(choices); return;
  }
  await interaction.respond([]);
}

async function approve(registrationId: string, actorId: string, context: ApplicationContext) {
  return context.services.registrations.updateStatus(registrationId,
    updateRegistrationStatusSchema.parse({ status: "approved" }), actorId);
}
async function reject(registrationId: string, reason: string, actorId: string, context: ApplicationContext) {
  return context.services.registrations.updateStatus(registrationId,
    updateRegistrationStatusSchema.parse({ status: "rejected", rejection_reason: reason }), actorId);
}

async function handleButton(interaction: ButtonInteraction, options: DiscordCommandHandlerOptions): Promise<void> {
  const match = new RegExp(`^${REGISTRATION_ACTION_PREFIX}:(approve|reject|details):([0-9a-f-]{36})$`, "iu").exec(interaction.customId);
  if (match === null) return;
  if (!isConfiguredGuild(interaction, options.env) || !memberHasRole(interaction, options.env.DISCORD_STAFF_ROLE_ID)) {
    await interaction.reply({ embeds: [createFeedbackEmbed("Sem permissão", "Somente a equipe do torneio pode usar estes botões.", DISCORD_THEME.purple)], flags: MessageFlags.Ephemeral }); return;
  }
  const action = match[1]!; const id = uuidSchema.parse(match[2]);
  if (action === "reject") {
    const input = new TextInputBuilder().setCustomId("motivo").setLabel("Motivo da recusa")
      .setStyle(TextInputStyle.Paragraph).setMinLength(3).setMaxLength(500).setRequired(true);
    await interaction.showModal(new ModalBuilder().setCustomId(`${REGISTRATION_ACTION_PREFIX}:reject-modal:${id}`)
      .setTitle("Recusar inscrição").addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (action === "details") {
    const registration = await options.context.services.registrations.getById(id);
    await interaction.editReply({ embeds: [createRegistrationDetailsEmbed(registration)], allowedMentions: NO_DISCORD_MENTIONS }); return;
  }
  const registration = await approve(id, interaction.user.id, options.context);
  await editFeedback(interaction, "Inscrição aprovada", `${registration.robloxUsername} foi aprovado. O cargo será entregue automaticamente.`, DISCORD_THEME.purple);
}

async function handleModal(interaction: ModalSubmitInteraction, options: DiscordCommandHandlerOptions): Promise<void> {
  const createMatch = REGISTRATION_CREATE_MODAL_PATTERN.exec(interaction.customId);
  if (createMatch !== null) {
    if (!isConfiguredGuild(interaction, options.env) || !memberHasRole(interaction, options.env.DISCORD_STAFF_ROLE_ID)) {
      await interaction.reply({ embeds: [createFeedbackEmbed("Sem permissão", "Somente a equipe pode criar inscrições.")], flags: MessageFlags.Ephemeral }); return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const tournamentId = uuidSchema.parse(createMatch[1]);
    const discordUserId = discordIdSchema.parse(createMatch[2]);
    let member: GuildMember;
    try {
      const guild = await interaction.client.guilds.fetch(options.env.DISCORD_GUILD_ID);
      member = await guild.members.fetch(discordUserId);
    } catch {
      throw new ValidationError(
        "Não foi possível confirmar esse jogador no servidor oficial. Tente novamente.",
      );
    }
    if (member.id !== discordUserId || member.guild.id !== options.env.DISCORD_GUILD_ID) {
      throw new ValidationError("O jogador selecionado não pertence ao servidor oficial.");
    }
    if (member.user.bot) {
      throw new ValidationError("Bots não podem ser inscritos no torneio.");
    }
    const input = createRegistrationSchema.parse({
      roblox_username: interaction.fields.getTextInputValue("roblox_username"),
      discord_user_id: member.id,
      discord_username: member.user.username,
      level: parseDecimalInteger(interaction.fields.getTextInputValue("level"), "O level"),
      bounty_honor: parseDecimalInteger(
        interaction.fields.getTextInputValue("bounty_honor"),
        "O Bounty/Honor",
      ),
      faction: createMatch[3],
      platform: createMatch[4],
      main_fruit: interaction.fields.getTextInputValue("main_fruit"),
    });
    const registration = await options.context.services.registrations.createByStaff(
      input,
      interaction.user.id,
      tournamentId,
    );
    await editFeedback(
      interaction,
      "Inscrição criada",
      `${registration.robloxUsername} foi inscrito e agora aguarda aprovação da equipe.`,
      DISCORD_THEME.purple,
    );
    return;
  }

  const match = new RegExp(`^${REGISTRATION_ACTION_PREFIX}:reject-modal:([0-9a-f-]{36})$`, "iu").exec(interaction.customId);
  if (match === null) return;
  if (!isConfiguredGuild(interaction, options.env) || !memberHasRole(interaction, options.env.DISCORD_STAFF_ROLE_ID)) {
    await interaction.reply({ embeds: [createFeedbackEmbed("Sem permissão", "Somente a equipe pode recusar inscrições.")], flags: MessageFlags.Ephemeral }); return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const registration = await reject(uuidSchema.parse(match[1]), interaction.fields.getTextInputValue("motivo"), interaction.user.id, options.context);
  await editFeedback(interaction, "Inscrição recusada", `${registration.robloxUsername} foi recusado e o motivo foi registrado.`, DISCORD_THEME.purple);
}

async function executeCommand(interaction: ChatInputCommandInteraction, options: DiscordCommandHandlerOptions): Promise<void> {
  const services = options.context.services;
  switch (interaction.commandName) {
    case DISCORD_COMMAND_NAMES.registrations: {
      const page = await services.registrations.list({ page: 1, limit: 100, status: "pending" });
      await interaction.editReply({ embeds: createPendingRegistrationEmbeds(page.items), allowedMentions: NO_DISCORD_MENTIONS }); return;
    }
    case DISCORD_COMMAND_NAMES.register: {
      const selectedUser = interaction.options.getUser("jogador", true);
      if (selectedUser.bot) {
        throw new ValidationError("Bots não podem ser inscritos no torneio.");
      }
      const faction = interaction.options.getString("faccao", true);
      const platform = interaction.options.getString("plataforma", true);
      const tournament = await beforeDiscordResponseDeadline(
        services.tournaments.getCurrent(),
      );
      if (tournament.status !== "registrations_open") {
        throw new ConflictError("As inscrições não estão abertas no momento.");
      }
      const modal = new ModalBuilder()
        .setCustomId(`${REGISTRATION_ACTION_PREFIX}:create:${tournament.id}:${selectedUser.id}:${faction}:${platform}`)
        .setTitle("Inscrever jogador")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("roblox_username").setLabel("Nick do Roblox")
              .setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(20).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("level").setLabel("Level")
              .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(5).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("bounty_honor").setLabel("Bounty ou Honor")
              .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(10).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("main_fruit").setLabel("Fruta principal")
              .setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(80).setRequired(true),
          ),
        );
      await interaction.showModal(modal);
      return;
    }
    case DISCORD_COMMAND_NAMES.approve: {
      const selectedUser = interaction.options.getUser("jogador", true);
      const registration = await services.registrations.getCurrentByDiscordUserId(selectedUser.id);
      const item = await approve(registration.id, interaction.user.id, options.context);
      await editFeedback(interaction, "Inscrição aprovada", `${item.robloxUsername} foi aprovado. O cargo será entregue automaticamente.`, DISCORD_THEME.purple); return;
    }
    case DISCORD_COMMAND_NAMES.reject: {
      const selectedUser = interaction.options.getUser("jogador", true);
      const pending = await services.registrations.getPendingByDiscordUserId(selectedUser.id);
      const item = await reject(pending.id, interaction.options.getString("motivo", true), interaction.user.id, options.context);
      await editFeedback(interaction, "Inscrição recusada", `${item.robloxUsername} foi recusado e o motivo foi registrado.`, DISCORD_THEME.purple); return;
    }
    case DISCORD_COMMAND_NAMES.result: {
      const input = matchResultSchema.parse({ player_one_score: interaction.options.getInteger("placar_jogador_1", true), player_two_score: interaction.options.getInteger("placar_jogador_2", true) });
      const result = await services.matches.recordResult(uuidSchema.parse(interaction.options.getString("partida", true)), input, interaction.user.id);
      await editFeedback(interaction, result.idempotent ? "Resultado já registrado" : "Resultado registrado",
        result.idempotent ? "Este placar já estava salvo. Nenhuma alteração foi necessária." : "O placar foi salvo e o vencedor avançou no chaveamento.", DISCORD_THEME.purple); return;
    }
    case DISCORD_COMMAND_NAMES.tournament: {
      const tournament = await services.tournaments.getCurrent();
      const query = { page: 1 as const, limit: 1 as const, tournament_id: tournament.id };
      const [all, approved, pending, rejected] = await Promise.all([
        services.registrations.list(query), services.registrations.list({ ...query, status: "approved" }),
        services.registrations.list({ ...query, status: "pending" }), services.registrations.list({ ...query, status: "rejected" }),
      ]);
      await interaction.editReply({ embeds: [createTournamentSummaryEmbed(tournament, { total: all.total, approved: approved.total, pending: pending.total, rejected: rejected.total })] }); return;
    }
    case DISCORD_COMMAND_NAMES.openRegistrations:
    case DISCORD_COMMAND_NAMES.closeRegistrations: {
      const tournament = await services.tournaments.getCurrent();
      const opened = interaction.commandName === DISCORD_COMMAND_NAMES.openRegistrations;
      const updated = opened ? await services.tournaments.setRegistrationsOpen(tournament.id, interaction.user.id)
        : await services.tournaments.setRegistrationsClosed(tournament.id, interaction.user.id);
      await editFeedback(interaction, opened ? "Inscrições abertas" : "Inscrições encerradas", `${updated.name} foi atualizado com sucesso.`, DISCORD_THEME.purple); return;
    }
    case DISCORD_COMMAND_NAMES.generateBracket: {
      const tournament = await services.tournaments.getCurrent();
      const bracket = await services.tournaments.generateBracket(tournament.id, interaction.user.id);
      await interaction.editReply({ embeds: createBracketEmbeds(bracket.tournament.name, bracket.matches) }); return;
    }
    case DISCORD_COMMAND_NAMES.participants: {
      const tournament = await services.tournaments.getCurrent();
      const page = await services.registrations.list({ page: 1, limit: 100, status: "approved", tournament_id: tournament.id });
      await interaction.editReply({ embeds: createParticipantsEmbeds(tournament.name, page.items), allowedMentions: NO_DISCORD_MENTIONS }); return;
    }
    case DISCORD_COMMAND_NAMES.bracket: {
      const bracket = await services.tournaments.getCurrentBracket();
      await interaction.editReply({ embeds: createBracketEmbeds(bracket.tournament.name, bracket.matches), allowedMentions: NO_DISCORD_MENTIONS }); return;
    }
    case DISCORD_COMMAND_NAMES.ping: {
      let healthy = false; try { healthy = await options.healthCheck(); } catch { healthy = false; }
      await interaction.editReply({ embeds: [createPingEmbed(interaction.client.ws.ping, healthy)] }); return;
    }
  }
}

export function createDiscordInteractionHandler(options: DiscordCommandHandlerOptions): DiscordInteractionHandler {
  return async (interaction: Interaction): Promise<void> => {
    try {
      if (interaction.isAutocomplete()) { await handleAutocomplete(interaction, options); return; }
      if (interaction.isButton()) { await handleButton(interaction, options); return; }
      if (interaction.isModalSubmit()) { await handleModal(interaction, options); return; }
      if (!interaction.isChatInputCommand()) return;
      if (!isConfiguredGuild(interaction, options.env)) {
        await interaction.reply({ embeds: [createFeedbackEmbed("Servidor não autorizado", "Use este comando no servidor oficial do Blox Rank BR.")], flags: MessageFlags.Ephemeral }); return;
      }
      const administrative = ADMIN_COMMANDS.has(interaction.commandName);
      if (!administrative && !PUBLIC_COMMANDS.has(interaction.commandName)) {
        await interaction.reply({ embeds: [createFeedbackEmbed("Comando não reconhecido", "Atualize o Discord e tente novamente.")], flags: MessageFlags.Ephemeral }); return;
      }
      if (administrative && !memberHasRole(interaction, options.env.DISCORD_STAFF_ROLE_ID)) {
        await interaction.reply({ embeds: [createFeedbackEmbed("Sem permissão", "Somente a equipe do torneio pode usar este comando.", DISCORD_THEME.purple)], flags: MessageFlags.Ephemeral }); return;
      }
      if (interaction.commandName === DISCORD_COMMAND_NAMES.register) {
        await executeCommand(interaction, options);
        return;
      }
      await interaction.deferReply(administrative ? { flags: MessageFlags.Ephemeral } : {});
      await executeCommand(interaction, options);
    } catch (error) {
      logFailure(options, interaction, error);
      if (interaction.isAutocomplete()) { if (!interaction.responded) await interaction.respond([]).catch(() => undefined); return; }
      if (interaction.isChatInputCommand() || interaction.isButton() || interaction.isModalSubmit()) await fail(interaction, error).catch(() => undefined);
    }
  };
}
