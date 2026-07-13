import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type GuildBasedChannel,
  type GuildMember,
  type Interaction,
} from "discord.js";
import type { ApplicationContext } from "./application-context.js";
import {
  createDiscordInteractionHandler,
  type SanitizedDiscordLogger,
} from "./commands/handlers.js";
import { NO_DISCORD_MENTIONS } from "./commands/embeds.js";
import type { AppEnv } from "./config/env.js";
import { DiscordOutboxWorker } from "./services/discord-outbox-worker.js";
import { hasUnsafeParticipantPermissions } from "./utils/discord-permissions.js";
import { sanitizeErrorName, sanitizeText } from "./utils/sanitize.js";

const READY_TIMEOUT_MS = 30_000;

export interface StartDiscordBotOptions {
  readonly env: AppEnv;
  readonly context: ApplicationContext;
  readonly healthCheck: () => Promise<boolean>;
  readonly logger: SanitizedDiscordLogger;
}

export interface DiscordBotRuntime {
  stop(): Promise<void>;
}

function configurationError(name: string): Error {
  const error = new Error("A configuração do Discord é inválida.");
  error.name = name;
  return error;
}

async function waitUntilReady(client: Client): Promise<void> {
  if (client.isReady()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onReady = (): void => {
      cleanup();
      resolve();
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(configurationError("DiscordReadyTimeout"));
    }, READY_TIMEOUT_MS);

    const cleanup = (): void => {
      clearTimeout(timeout);
      client.off(Events.ClientReady, onReady);
    };

    client.once(Events.ClientReady, onReady);
    if (client.isReady()) {
      onReady();
    }
  });
}

function validateConfiguredChannel(channel: GuildBasedChannel | null, botMember: GuildMember): void {
  if (
    channel === null ||
    (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)
  ) {
    throw configurationError("DiscordConfiguredChannelInvalid");
  }

  const permissions = channel.permissionsFor(botMember);
  if (
    !permissions.has([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
    ])
  ) {
    throw configurationError("DiscordConfiguredChannelMissingPermissions");
  }
}

async function validateDiscordConfiguration(client: Client, env: AppEnv): Promise<void> {
  if (client.user === null || client.application?.id !== env.DISCORD_APPLICATION_ID) {
    throw configurationError("DiscordApplicationMismatch");
  }

  const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID);
  if (!guild.available) {
    throw configurationError("DiscordGuildUnavailable");
  }

  const [botMember, staffRole, participantRole, registrationsChannel, logsChannel] =
    await Promise.all([
      guild.members.fetchMe(),
      guild.roles.fetch(env.DISCORD_STAFF_ROLE_ID),
      guild.roles.fetch(env.DISCORD_PARTICIPANT_ROLE_ID),
      guild.channels.fetch(env.DISCORD_INSCRICOES_CHANNEL_ID),
      guild.channels.fetch(env.DISCORD_LOGS_CHANNEL_ID),
    ]);

  if (staffRole === null || staffRole.id === guild.id) {
    throw configurationError("DiscordStaffRoleInvalid");
  }
  if (
    participantRole === null ||
    participantRole.id === guild.id ||
    participantRole.managed ||
    participantRole.id === staffRole.id ||
    hasUnsafeParticipantPermissions(participantRole.permissions.bitfield)
  ) {
    throw configurationError("DiscordParticipantRoleInvalid");
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw configurationError("DiscordBotMissingManageRoles");
  }
  if (
    botMember.roles.highest.comparePositionTo(participantRole) <= 0 ||
    !participantRole.editable
  ) {
    throw configurationError("DiscordParticipantRoleHierarchyInvalid");
  }

  validateConfiguredChannel(registrationsChannel, botMember);
  validateConfiguredChannel(logsChannel, botMember);
}

function interactionLogFields(interaction: Interaction, error: unknown) {
  return {
    event: "discord.interaction.unhandled_failure",
    errorName: sanitizeErrorName(error),
    interactionId: interaction.id,
    interactionType: interaction.type,
    ...(interaction.isChatInputCommand()
      ? { commandName: sanitizeText(interaction.commandName).slice(0, 32) }
      : {}),
  } as const;
}

export async function startDiscordBot(
  options: StartDiscordBotOptions,
): Promise<DiscordBotRuntime> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: NO_DISCORD_MENTIONS,
  });
  const interactionHandler = createDiscordInteractionHandler(options);
  const outboxWorker = new DiscordOutboxWorker({
    client,
    env: options.env,
    outbox: options.context.repositories.outbox,
    registrations: options.context.services.registrations,
    logger: options.logger,
  });

  const onInteraction = (interaction: Interaction): void => {
    void interactionHandler(interaction).catch((error: unknown) => {
      options.logger.error(
        interactionLogFields(interaction, error),
        "Uma interação do Discord falhou fora do tratamento central",
      );
    });
  };
  const onClientError = (error: Error): void => {
    options.logger.error(
      { event: "discord.client.error", errorName: sanitizeErrorName(error) },
      "O cliente do Discord informou uma falha",
    );
  };
  const onClientWarning = (): void => {
    options.logger.warn(
      { event: "discord.client.warning" },
      "O cliente do Discord informou um aviso sanitizado",
    );
  };

  client.on(Events.InteractionCreate, onInteraction);
  client.on(Events.Error, onClientError);
  client.on(Events.Warn, onClientWarning);

  try {
    await client.login(options.env.DISCORD_BOT_TOKEN);
    await waitUntilReady(client);
    await validateDiscordConfiguration(client, options.env);
    outboxWorker.start();
    options.logger.info(
      {
        event: "discord.runtime.started",
        guildId: options.env.DISCORD_GUILD_ID,
        applicationId: options.env.DISCORD_APPLICATION_ID,
      },
      "O runtime do Discord foi iniciado",
    );
  } catch (error: unknown) {
    options.logger.error(
      { event: "discord.runtime.start_failed", errorName: sanitizeErrorName(error) },
      "Não foi possível iniciar o runtime do Discord",
    );
    await outboxWorker.stop();
    client.destroy();
    throw configurationError("DiscordRuntimeStartupFailed");
  }

  let stopped = false;
  return {
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }
      stopped = true;

      try {
        await outboxWorker.stop();
      } catch (error: unknown) {
        options.logger.warn(
          { event: "discord.outbox.stop_failed", errorName: sanitizeErrorName(error) },
          "O worker do Discord não encerrou normalmente",
        );
      } finally {
        client.removeListener(Events.InteractionCreate, onInteraction);
        client.removeListener(Events.Error, onClientError);
        client.removeListener(Events.Warn, onClientWarning);
        client.destroy();
      }

      options.logger.info(
        { event: "discord.runtime.stopped" },
        "O runtime do Discord foi encerrado",
      );
    },
  };
}
