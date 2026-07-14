import { createHash, randomUUID } from "node:crypto";
import type { ActionRowBuilder, Client, EmbedBuilder, MessageActionRowComponentBuilder } from "discord.js";
import { z } from "zod";
import type { ApplicationContext } from "../application-context.js";
import {
  createAdministrativeActionEmbed,
  createNewRegistrationEmbed,
  createRegistrationActionRow,
  NO_DISCORD_MENTIONS,
} from "../commands/embeds.js";
import type { AppEnv } from "../config/env.js";
import type { DiscordOutboxMessage } from "../types/domain.js";
import { hasUnsafeParticipantPermissions } from "../utils/discord-permissions.js";
import { sanitizeErrorName, sanitizeText } from "../utils/sanitize.js";
import { discordIdSchema, uuidSchema } from "../utils/schemas.js";
import { DISCORD_OUTBOX_EVENTS, type DiscordOutboxEvent } from "./discord-events.js";

const CLAIM_BATCH_SIZE = 10;
const MINIMUM_RETRY_DELAY_MS = 5_000;
const MAXIMUM_RETRY_DELAY_MS = 15 * 60_000;

const cleanText = (minimum: number, maximum: number) =>
  z
    .string()
    .transform(sanitizeText)
    .pipe(z.string().min(minimum).max(maximum));

const robloxUsernameSchema = z
  .string()
  .transform(sanitizeText)
  .pipe(z.string().min(3).max(20).regex(/^[A-Za-z0-9_]+$/));

const registrationCreatedPayloadSchema = z
  .object({
    registrationId: uuidSchema,
    tournamentId: uuidSchema,
    tournamentName: cleanText(1, 120),
    robloxUsername: robloxUsernameSchema,
    discordUserId: discordIdSchema,
    discordUsername: cleanText(2, 64),
    level: z.number().int().min(1).max(10_000),
    bountyHonor: z.number().int().min(0).max(1_000_000_000),
    faction: z.enum(["pirate", "marine"]),
    platform: z.enum(["pc", "mobile", "console"]),
    mainFruit: cleanText(1, 80),
  })
  .strict();

const participantRoleGrantPayloadSchema = z
  .object({
    registrationId: uuidSchema,
    discordUserId: discordIdSchema,
    roleId: discordIdSchema,
  })
  .strict();

const registrationApprovedActionSchema = z
  .object({
    action: z.literal("registration.approved"),
    actorDiscordId: discordIdSchema,
    targetId: uuidSchema,
    robloxUsername: robloxUsernameSchema,
  })
  .strict();

const registrationRejectedActionSchema = z
  .object({
    action: z.literal("registration.rejected"),
    actorDiscordId: discordIdSchema,
    targetId: uuidSchema,
    robloxUsername: robloxUsernameSchema,
    rejectionReason: cleanText(3, 500),
  })
  .strict();

const participantRoleRetryActionSchema = z
  .object({
    action: z.literal("registration.participant_role_retry_requested"),
    actorDiscordId: discordIdSchema,
    targetId: uuidSchema,
    robloxUsername: robloxUsernameSchema,
  })
  .strict();

const matchResultRecordedActionSchema = z
  .object({
    action: z.literal("match.result_recorded"),
    actorDiscordId: discordIdSchema,
    targetId: uuidSchema,
    tournamentId: uuidSchema,
    round: z.number().int().min(1).max(4),
    bracketPosition: z.number().int().min(1).max(8),
    playerOneScore: z.number().int().min(0).max(100),
    playerTwoScore: z.number().int().min(0).max(100),
    winnerRobloxUsername: robloxUsernameSchema,
    champion: z.boolean(),
  })
  .strict();

const tournamentActionFields = {
  actorDiscordId: discordIdSchema,
  targetId: uuidSchema,
  tournamentName: cleanText(1, 120),
} as const;

const tournamentCreatedActionSchema = z
  .object({
    action: z.literal("tournament.created"),
    ...tournamentActionFields,
  })
  .strict();

const tournamentRegistrationsClosedActionSchema = z
  .object({
    action: z.literal("tournament.registrations_closed"),
    ...tournamentActionFields,
  })
  .strict();

const tournamentRegistrationsReopenedActionSchema = z
  .object({
    action: z.literal("tournament.registrations_reopened"),
    ...tournamentActionFields,
  })
  .strict();

const tournamentBracketGeneratedActionSchema = z
  .object({
    action: z.literal("tournament.bracket_generated"),
    ...tournamentActionFields,
  })
  .strict();

const administrativeActionPayloadSchema = z.discriminatedUnion("action", [
  registrationApprovedActionSchema,
  registrationRejectedActionSchema,
  participantRoleRetryActionSchema,
  matchResultRecordedActionSchema,
  tournamentCreatedActionSchema,
  tournamentRegistrationsClosedActionSchema,
  tournamentRegistrationsReopenedActionSchema,
  tournamentBracketGeneratedActionSchema,
]);

const registrationCreatedEventSchema = z
  .object({
    eventType: z.literal(DISCORD_OUTBOX_EVENTS.registrationCreated),
    channelId: discordIdSchema,
    payload: registrationCreatedPayloadSchema,
  })
  .strict();

const administrativeActionEventSchema = z
  .object({
    eventType: z.literal(DISCORD_OUTBOX_EVENTS.administrativeAction),
    channelId: discordIdSchema,
    payload: administrativeActionPayloadSchema,
  })
  .strict();

const participantRoleGrantEventSchema = z
  .object({
    eventType: z.literal(DISCORD_OUTBOX_EVENTS.participantRoleGrant),
    channelId: discordIdSchema,
    payload: participantRoleGrantPayloadSchema,
  })
  .strict();

type AdministrativeActionPayload = z.infer<typeof administrativeActionPayloadSchema>;

export interface DiscordOutboxWorkerLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export interface DiscordOutboxWorkerOptions {
  client: Client;
  env: AppEnv;
  outbox: ApplicationContext["repositories"]["outbox"];
  registrations: ApplicationContext["services"]["registrations"];
  logger: DiscordOutboxWorkerLogger;
}

class DiscordOutboxConfigurationError extends Error {
  public constructor() {
    super("A configuração do destino do Discord não corresponde ao evento.");
    this.name = "DiscordOutboxConfigurationError";
  }
}

class UnsupportedDiscordOutboxEventError extends Error {
  public constructor() {
    super("O tipo de evento da outbox não é suportado.");
    this.name = "UnsupportedDiscordOutboxEventError";
  }
}

function retryDelayMs(attempt: number): number {
  const safeAttempt = Number.isSafeInteger(attempt) ? Math.max(1, attempt) : 1;
  const exponent = Math.min(safeAttempt - 1, 8);
  return Math.min(MINIMUM_RETRY_DELAY_MS * 2 ** exponent, MAXIMUM_RETRY_DELAY_MS);
}

function knownEventType(eventType: string): DiscordOutboxEvent | "unsupported" {
  const knownEvents = Object.values(DISCORD_OUTBOX_EVENTS) as readonly string[];
  return knownEvents.includes(eventType) ? (eventType as DiscordOutboxEvent) : "unsupported";
}

function messageNonce(outboxId: string): string {
  return createHash("sha256").update(outboxId, "utf8").digest("hex").slice(0, 24);
}

function administrativeActionEmbed(payload: AdministrativeActionPayload): EmbedBuilder {
  switch (payload.action) {
    case "registration.approved":
      return createAdministrativeActionEmbed({
        title: "Inscrição aprovada",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [{ name: "Jogador", value: payload.robloxUsername }],
      });
    case "registration.rejected":
      return createAdministrativeActionEmbed({
        title: "Inscrição recusada",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [
          { name: "Jogador", value: payload.robloxUsername, inline: true },
          { name: "Motivo", value: payload.rejectionReason },
        ],
      });
    case "registration.participant_role_retry_requested":
      return createAdministrativeActionEmbed({
        title: "Nova tentativa de entregar cargo",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [{ name: "Jogador", value: payload.robloxUsername }],
      });
    case "match.result_recorded":
      return createAdministrativeActionEmbed({
        title: "Resultado registrado",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [
          { name: "Rodada", value: payload.round, inline: true },
          { name: "Partida", value: payload.bracketPosition, inline: true },
          {
            name: "Placar",
            value: `${payload.playerOneScore} × ${payload.playerTwoScore}`,
            inline: true,
          },
          { name: "Torneio", value: payload.tournamentId },
          { name: payload.champion ? "Campeão" : "Avançou", value: payload.winnerRobloxUsername },
        ],
      });
    case "tournament.created":
      return createAdministrativeActionEmbed({
        title: "Torneio criado",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [{ name: "Torneio", value: payload.tournamentName }],
      });
    case "tournament.registrations_closed":
      return createAdministrativeActionEmbed({
        title: "Inscrições encerradas",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [{ name: "Torneio", value: payload.tournamentName }],
      });
    case "tournament.registrations_reopened":
      return createAdministrativeActionEmbed({
        title: "Inscrições reabertas",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [{ name: "Torneio", value: payload.tournamentName }],
      });
    case "tournament.bracket_generated":
      return createAdministrativeActionEmbed({
        title: "Chaveamento gerado",
        actorDiscordId: payload.actorDiscordId,
        targetId: payload.targetId,
        details: [{ name: "Torneio", value: payload.tournamentName }],
      });
  }
}

export class DiscordOutboxWorker {
  private readonly workerId = `discord-${process.pid}-${randomUUID()}`;
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private running = false;
  private lifecycle = 0;

  public constructor(private readonly options: DiscordOutboxWorkerOptions) {}

  public start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.lifecycle += 1;
    const lifecycle = this.lifecycle;
    this.options.logger.info({ event: "discord.outbox.worker.started" }, "Outbox do Discord iniciada.");

    const currentPoll = this.inFlight;
    if (currentPoll === undefined) {
      this.schedulePoll(0, lifecycle);
      return;
    }

    void currentPoll.finally(() => {
      if (this.running && this.lifecycle === lifecycle && this.timer === undefined) {
        this.schedulePoll(0, lifecycle);
      }
    });
  }

  public async stop(): Promise<void> {
    if (!this.running && this.inFlight === undefined) {
      return;
    }

    this.running = false;
    this.lifecycle += 1;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    await this.inFlight;
    this.options.logger.info({ event: "discord.outbox.worker.stopped" }, "Outbox do Discord encerrada.");
  }

  private schedulePoll(delayMs: number, lifecycle: number): void {
    if (!this.running || this.lifecycle !== lifecycle || this.timer !== undefined) {
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (!this.running || this.lifecycle !== lifecycle) {
        return;
      }

      const poll = this.poll();
      this.inFlight = poll;
      void poll.finally(() => {
        if (this.inFlight === poll) {
          this.inFlight = undefined;
        }
        if (this.running && this.lifecycle === lifecycle) {
          this.schedulePoll(this.options.env.OUTBOX_POLL_INTERVAL_MS, lifecycle);
        }
      });
    }, delayMs);
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    try {
      const messages = await this.options.outbox.claimPending(CLAIM_BATCH_SIZE, this.workerId);
      await Promise.all(messages.map(async (message) => this.processClaimedMessage(message)));
    } catch (error) {
      this.options.logger.error(
        {
          event: "discord.outbox.poll.failed",
          errorType: sanitizeErrorName(error),
        },
        "Falha sanitizada ao consultar a outbox do Discord.",
      );
    }
  }

  private async processClaimedMessage(message: DiscordOutboxMessage): Promise<void> {
    try {
      await this.dispatch(message);
      const processed = await this.options.outbox.markProcessed(message.id, this.workerId);
      if (processed === null) {
        this.options.logger.warn(
          {
            event: "discord.outbox.lease_lost",
            outboxId: message.id,
            eventType: knownEventType(message.eventType),
          },
          "A confirmação da outbox não pertence mais a este worker.",
        );
        return;
      }

      this.options.logger.info(
        {
          event: "discord.outbox.processed",
          outboxId: message.id,
          eventType: knownEventType(message.eventType),
          attempt: message.attempts,
        },
        "Evento do Discord processado.",
      );
    } catch (error) {
      const errorType = sanitizeErrorName(error);
      try {
        const failed = await this.options.outbox.markFailed(
          message.id,
          this.workerId,
          errorType,
          retryDelayMs(message.attempts),
        );
        this.options.logger.warn(
          {
            event: failed === null ? "discord.outbox.lease_lost" : "discord.outbox.delivery_failed",
            outboxId: message.id,
            eventType: knownEventType(message.eventType),
            attempt: message.attempts,
            willRetry: failed?.status === "pending",
            errorType,
          },
          "Falha sanitizada ao processar evento do Discord.",
        );
      } catch (markError) {
        this.options.logger.error(
          {
            event: "discord.outbox.failure_record_failed",
            outboxId: message.id,
            eventType: knownEventType(message.eventType),
            errorType: sanitizeErrorName(markError),
          },
          "Não foi possível registrar a falha sanitizada da outbox.",
        );
      }
    }
  }

  private async dispatch(message: DiscordOutboxMessage): Promise<void> {
    const event = {
      eventType: message.eventType,
      channelId: message.channelId,
      payload: message.payload,
    };

    switch (message.eventType) {
      case DISCORD_OUTBOX_EVENTS.registrationCreated: {
        const parsed = registrationCreatedEventSchema.parse(event);
        if (parsed.channelId !== this.options.env.DISCORD_INSCRICOES_CHANNEL_ID) {
          throw new DiscordOutboxConfigurationError();
        }
        await this.sendToConfiguredChannel(
          parsed.channelId,
          createNewRegistrationEmbed({
            id: parsed.payload.registrationId,
            tournamentName: parsed.payload.tournamentName,
            robloxUsername: parsed.payload.robloxUsername,
            discordUserId: parsed.payload.discordUserId,
            discordUsername: parsed.payload.discordUsername,
            level: parsed.payload.level,
            bountyHonor: parsed.payload.bountyHonor,
            faction: parsed.payload.faction,
            platform: parsed.payload.platform,
            mainFruit: parsed.payload.mainFruit,
          }),
          message.id,
          createRegistrationActionRow(parsed.payload.registrationId),
        );
        return;
      }
      case DISCORD_OUTBOX_EVENTS.administrativeAction: {
        const parsed = administrativeActionEventSchema.parse(event);
        if (parsed.channelId !== this.options.env.DISCORD_LOGS_CHANNEL_ID) {
          throw new DiscordOutboxConfigurationError();
        }
        await this.sendToConfiguredChannel(
          parsed.channelId,
          administrativeActionEmbed(parsed.payload),
          message.id,
        );
        return;
      }
      case DISCORD_OUTBOX_EVENTS.participantRoleGrant: {
        const parsed = participantRoleGrantEventSchema.parse(event);
        if (
          parsed.channelId !== this.options.env.DISCORD_LOGS_CHANNEL_ID ||
          parsed.payload.roleId !== this.options.env.DISCORD_PARTICIPANT_ROLE_ID
        ) {
          throw new DiscordOutboxConfigurationError();
        }
        await this.grantParticipantRole(
          parsed.payload.registrationId,
          parsed.payload.discordUserId,
        );
        return;
      }
      default:
        throw new UnsupportedDiscordOutboxEventError();
    }
  }

  private async sendToConfiguredChannel(
    channelId: string,
    embed: EmbedBuilder,
    outboxId: string,
    components?: ActionRowBuilder<MessageActionRowComponentBuilder>,
  ): Promise<void> {
    const channel = await this.options.client.channels.fetch(channelId);
    if (channel === null || channel.id !== channelId || channel.isDMBased()) {
      throw new DiscordOutboxConfigurationError();
    }
    if (!channel.isSendable() || channel.guildId !== this.options.env.DISCORD_GUILD_ID) {
      throw new DiscordOutboxConfigurationError();
    }

    await channel.send({
      embeds: [embed],
      ...(components === undefined ? {} : { components: [components] }),
      allowedMentions: NO_DISCORD_MENTIONS,
      nonce: messageNonce(outboxId),
      enforceNonce: true,
    });
  }

  private async grantParticipantRole(
    registrationId: string,
    discordUserId: string,
  ): Promise<void> {
    const registration = await this.options.registrations.getById(registrationId);
    if (
      registration.status !== "approved" ||
      registration.discordUserId !== discordUserId
    ) {
      throw new DiscordOutboxConfigurationError();
    }

    const guild = await this.options.client.guilds.fetch(this.options.env.DISCORD_GUILD_ID);
    if (guild.id !== this.options.env.DISCORD_GUILD_ID) {
      throw new DiscordOutboxConfigurationError();
    }

    const role = await guild.roles.fetch(this.options.env.DISCORD_PARTICIPANT_ROLE_ID);
    if (
      role === null ||
      role.id !== this.options.env.DISCORD_PARTICIPANT_ROLE_ID ||
      role.guild.id !== this.options.env.DISCORD_GUILD_ID ||
      role.managed ||
      hasUnsafeParticipantPermissions(role.permissions.bitfield)
    ) {
      throw new DiscordOutboxConfigurationError();
    }

    const member = await guild.members.fetch(discordUserId);
    if (member.id !== discordUserId || member.guild.id !== this.options.env.DISCORD_GUILD_ID) {
      throw new DiscordOutboxConfigurationError();
    }
    if (member.roles.cache.has(role.id)) {
      return;
    }

    await member.roles.add(role, "Participante aprovado no Blox Rank BR");
  }
}
