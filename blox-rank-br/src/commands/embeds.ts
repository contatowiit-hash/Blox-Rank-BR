import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageActionRowComponentBuilder,
  type APIEmbedField,
  type ColorResolvable,
  type MessageMentionOptions,
} from "discord.js";
import type { BracketMatch, Registration, Tournament } from "../types/domain.js";
import {
  escapeDiscordMarkdown,
  sanitizeText,
  truncateText,
} from "../utils/sanitize.js";

const EMBED_TITLE_MAX_LENGTH = 256;
const EMBED_DESCRIPTION_MAX_LENGTH = 4_096;
const EMBED_FIELD_NAME_MAX_LENGTH = 256;
const EMBED_FIELD_VALUE_MAX_LENGTH = 1_024;
const EMBED_FIELDS_MAX = 25;
const EMBEDS_PER_MESSAGE_MAX = 10;
const REGISTRATIONS_PER_EMBED = 10;

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 0,
});

export const DISCORD_THEME = {
  darkBlue: 0x102a43,
  purple: 0x6d28d9,
} as const;

export const NO_DISCORD_MENTIONS = {
  parse: [],
  repliedUser: false,
} satisfies MessageMentionOptions;

export const REGISTRATION_ACTION_PREFIX = "registration";

export function createRegistrationActionRow(registrationId: string) {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${REGISTRATION_ACTION_PREFIX}:approve:${registrationId}`)
      .setLabel("Aprovar").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${REGISTRATION_ACTION_PREFIX}:reject:${registrationId}`)
      .setLabel("Recusar").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`${REGISTRATION_ACTION_PREFIX}:details:${registrationId}`)
      .setLabel("Ver detalhes").setStyle(ButtonStyle.Secondary),
  );
}

export type RegistrationEmbedData = Pick<
  Registration,
  | "id"
  | "robloxUsername"
  | "discordUserId"
  | "discordUsername"
  | "level"
  | "bountyHonor"
  | "faction"
  | "platform"
  | "mainFruit"
> & { readonly tournamentName?: string };

export type BracketEmbedMatch = Pick<
  BracketMatch,
  | "round"
  | "bracketPosition"
  | "playerOne"
  | "playerTwo"
  | "playerOneScore"
  | "playerTwoScore"
  | "winner"
>;

export interface AdministrativeEmbedDetail {
  readonly name: string;
  readonly value: string | number;
  readonly inline?: boolean;
}

export interface AdministrativeActionEmbedInput {
  readonly title: string;
  readonly actorDiscordId: string;
  readonly targetId?: string | null;
  readonly description?: string;
  readonly details?: readonly AdministrativeEmbedDetail[];
  readonly occurredAt?: Date;
}

function safeText(value: string, maxLength: number): string {
  const withoutMentions = escapeDiscordMarkdown(value).replaceAll("@", "@\u200b");
  return truncateText(withoutMentions, maxLength);
}

function inlineCode(value: string, maxLength = EMBED_FIELD_VALUE_MAX_LENGTH): string {
  const contentLength = Math.max(0, maxLength - 2);
  const clean = sanitizeText(value)
    .replaceAll("`", "")
    .replaceAll("@", "@\u200b");
  return `\`${truncateText(clean, contentLength)}\``;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "Não disponível";
  }
  return numberFormatter.format(Math.trunc(value));
}

function formatFaction(value: Registration["faction"]): string {
  const labels: Record<Registration["faction"], string> = {
    pirate: "Pirata",
    marine: "Marinheiro",
  };
  return labels[value];
}

function formatPlatform(value: Registration["platform"]): string {
  const labels: Record<Registration["platform"], string> = {
    pc: "Computador",
    mobile: "Celular",
    console: "Console",
  };
  return labels[value];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function createBaseEmbed(
  title: string,
  color: ColorResolvable = DISCORD_THEME.darkBlue,
  timestamp: Date = new Date(),
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(safeText(title, EMBED_TITLE_MAX_LENGTH))
    .setTimestamp(timestamp)
    .setFooter({ text: "Blox Rank BR" });
}

export function createFeedbackEmbed(
  title: string,
  message: string,
  color: ColorResolvable = DISCORD_THEME.darkBlue,
): EmbedBuilder {
  return createBaseEmbed(title, color).setDescription(
    safeText(message, EMBED_DESCRIPTION_MAX_LENGTH),
  );
}

export function createNewRegistrationEmbed(registration: RegistrationEmbedData): EmbedBuilder {
  const embed = createBaseEmbed("Nova inscrição", DISCORD_THEME.darkBlue)
    .setDescription("Uma nova inscrição aguarda a análise da equipe.")
    .addFields(
      {
        name: "Jogador no Roblox",
        value: safeText(registration.robloxUsername, EMBED_FIELD_VALUE_MAX_LENGTH),
        inline: true,
      },
      {
        name: "Discord",
        value: safeText(registration.discordUsername, EMBED_FIELD_VALUE_MAX_LENGTH),
        inline: true,
      },
      {
        name: "ID do Discord",
        value: inlineCode(registration.discordUserId),
        inline: false,
      },
      { name: "Nível", value: formatNumber(registration.level), inline: true },
      {
        name: "Bounty/Honor",
        value: formatNumber(registration.bountyHonor),
        inline: true,
      },
      { name: "Facção", value: formatFaction(registration.faction), inline: true },
      { name: "Onde joga", value: formatPlatform(registration.platform), inline: true },
      {
        name: "Fruta principal",
        value: safeText(registration.mainFruit, EMBED_FIELD_VALUE_MAX_LENGTH),
        inline: true,
      },
      { name: "Código da inscrição", value: inlineCode(registration.id), inline: false },
    );
  if (registration.tournamentName !== undefined) {
    embed.addFields({
      name: "Torneio",
      value: safeText(registration.tournamentName, EMBED_FIELD_VALUE_MAX_LENGTH),
      inline: false,
    });
  }
  return embed;
}

export function createRegistrationDetailsEmbed(registration: RegistrationEmbedData): EmbedBuilder {
  return createNewRegistrationEmbed(registration).setTitle("Detalhes da inscrição");
}

export function createTournamentSummaryEmbed(
  tournament: Tournament,
  counts: { total: number; approved: number; pending: number; rejected: number },
): EmbedBuilder {
  const statuses: Record<Tournament["status"], string> = {
    draft: "Em preparação", registrations_open: "Inscrições abertas",
    registrations_closed: "Inscrições encerradas", active: "Em andamento", finished: "Finalizado",
  };
  return createBaseEmbed(tournament.name, DISCORD_THEME.darkBlue).addFields(
    { name: "UUID", value: inlineCode(tournament.id), inline: false },
    { name: "Status", value: statuses[tournament.status], inline: true },
    { name: "Limite", value: formatNumber(tournament.maxPlayers), inline: true },
    { name: "Inscrições", value: formatNumber(counts.total), inline: true },
    { name: "Aprovados", value: formatNumber(counts.approved), inline: true },
    { name: "Pendentes", value: formatNumber(counts.pending), inline: true },
    { name: "Recusados", value: formatNumber(counts.rejected), inline: true },
  );
}

export function createParticipantsEmbeds(name: string, registrations: readonly RegistrationEmbedData[]): EmbedBuilder[] {
  if (registrations.length === 0) return [createFeedbackEmbed(name, "Ainda não há participantes aprovados.")];
  return chunk(registrations, REGISTRATIONS_PER_EMBED).slice(0, EMBEDS_PER_MESSAGE_MAX).map((page, index) =>
    createBaseEmbed(`${name} — Participantes${registrations.length > REGISTRATIONS_PER_EMBED ? ` ${index + 1}` : ""}`,
      index % 2 === 0 ? DISCORD_THEME.darkBlue : DISCORD_THEME.purple).addFields(page.map((item, itemIndex) => ({
        name: `${index * REGISTRATIONS_PER_EMBED + itemIndex + 1}. ${safeText(item.robloxUsername, 200)}`,
        value: `Discord: ${safeText(item.discordUsername, 100)}\nBounty/Honor: ${formatNumber(item.bountyHonor)}\nPlataforma: ${formatPlatform(item.platform)}`,
        inline: true,
      }))),
  );
}

function pendingRegistrationField(
  registration: RegistrationEmbedData,
  position: number,
): APIEmbedField {
  const value = [
    `Código: ${inlineCode(registration.id, 120)}`,
    `Discord: ${safeText(registration.discordUsername, 100)}`,
    `Bounty/Honor: ${formatNumber(registration.bountyHonor)}`,
  ].join("\n");

  return {
    name: `#${position} ${safeText(registration.robloxUsername, 220)}`,
    value: truncateText(value, EMBED_FIELD_VALUE_MAX_LENGTH),
    inline: false,
  };
}

export function createPendingRegistrationEmbeds(
  registrations: readonly RegistrationEmbedData[],
): EmbedBuilder[] {
  if (registrations.length === 0) {
    return [
      createFeedbackEmbed(
        "Inscrições pendentes",
        "Nenhuma inscrição está aguardando análise.",
      ),
    ];
  }

  const maximumVisible = REGISTRATIONS_PER_EMBED * EMBEDS_PER_MESSAGE_MAX;
  const visibleRegistrations = registrations.slice(0, maximumVisible);
  const pages = chunk(visibleRegistrations, REGISTRATIONS_PER_EMBED);

  return pages.map((page, pageIndex) => {
    const pageLabel = pages.length > 1 ? ` — ${pageIndex + 1}/${pages.length}` : "";
    const embed = createBaseEmbed(
      `Inscrições pendentes${pageLabel}`,
      pageIndex % 2 === 0 ? DISCORD_THEME.darkBlue : DISCORD_THEME.purple,
    ).addFields(
      page.map((registration, itemIndex) =>
        pendingRegistrationField(
          registration,
          pageIndex * REGISTRATIONS_PER_EMBED + itemIndex + 1,
        ),
      ),
    );

    if (registrations.length > maximumVisible && pageIndex === pages.length - 1) {
      embed.setFooter({
        text: `Mostrando ${maximumVisible} de ${registrations.length}. Veja as demais no site.`,
      });
    }

    return embed;
  });
}

export function createAdministrativeActionEmbed(
  input: AdministrativeActionEmbedInput,
): EmbedBuilder {
  const fields: APIEmbedField[] = [
    { name: "Responsável", value: inlineCode(input.actorDiscordId), inline: true },
  ];

  if (input.targetId !== undefined && input.targetId !== null) {
    fields.push({ name: "Registro", value: inlineCode(input.targetId), inline: true });
  }

  const availableDetailFields = EMBED_FIELDS_MAX - fields.length;
  for (const detail of input.details?.slice(0, availableDetailFields) ?? []) {
    fields.push({
      name: safeText(detail.name, EMBED_FIELD_NAME_MAX_LENGTH),
      value: safeText(String(detail.value), EMBED_FIELD_VALUE_MAX_LENGTH),
      inline: detail.inline ?? false,
    });
  }

  const embed = createBaseEmbed(
    input.title,
    DISCORD_THEME.purple,
    input.occurredAt ?? new Date(),
  ).addFields(fields);

  if (input.description !== undefined) {
    embed.setDescription(safeText(input.description, EMBED_DESCRIPTION_MAX_LENGTH));
  }

  return embed;
}

function roundLabel(round: number): string {
  const labels: Record<number, string | undefined> = {
    1: "Oitavas de final",
    2: "Quartas de final",
    3: "Semifinais",
    4: "Final",
  };
  return labels[round] ?? `Rodada ${formatNumber(round)}`;
}

function formatBracketPlayer(matchPlayer: BracketMatch["playerOne"]): string {
  if (matchPlayer === null) {
    return "A definir";
  }
  return `#${formatNumber(matchPlayer.seed)} ${safeText(matchPlayer.robloxUsername, 120)}`;
}

function formatBracketMatch(match: BracketEmbedMatch): string {
  const playerOneScore =
    match.playerOneScore === null ? "" : ` — **${formatNumber(match.playerOneScore)}**`;
  const playerTwoScore =
    match.playerTwoScore === null ? "" : ` — **${formatNumber(match.playerTwoScore)}**`;
  const lines = [
    `${formatBracketPlayer(match.playerOne)}${playerOneScore}`,
    `${formatBracketPlayer(match.playerTwo)}${playerTwoScore}`,
  ];

  if (match.winner !== null) {
    lines.push(`Vencedor: ${formatBracketPlayer(match.winner)}`);
  }

  return truncateText(lines.join("\n"), EMBED_FIELD_VALUE_MAX_LENGTH);
}

export function createBracketEmbeds(
  tournamentName: string,
  matches: readonly BracketEmbedMatch[],
): EmbedBuilder[] {
  if (matches.length === 0) {
    return [
      createFeedbackEmbed(
        tournamentName,
        "O chaveamento ainda não foi gerado.",
        DISCORD_THEME.purple,
      ),
    ];
  }

  const sortedMatches = [...matches].sort(
    (left, right) => left.round - right.round || left.bracketPosition - right.bracketPosition,
  );
  const rounds = [...new Set(sortedMatches.map((match) => match.round))].slice(
    0,
    EMBEDS_PER_MESSAGE_MAX,
  );

  return rounds.map((round, roundIndex) => {
    const roundMatches = sortedMatches
      .filter((match) => match.round === round)
      .slice(0, EMBED_FIELDS_MAX);
    const title = `${tournamentName} — ${roundLabel(round)}`;

    return createBaseEmbed(
      title,
      roundIndex % 2 === 0 ? DISCORD_THEME.darkBlue : DISCORD_THEME.purple,
    ).addFields(
      roundMatches.map((match) => ({
        name: `Partida ${formatNumber(match.bracketPosition)}`,
        value: formatBracketMatch(match),
        inline: false,
      })),
    );
  });
}

export function createPingEmbed(gatewayLatencyMs: number, apiHealthy: boolean): EmbedBuilder {
  const gatewayStatus =
    Number.isFinite(gatewayLatencyMs) && gatewayLatencyMs >= 0
      ? `${formatNumber(gatewayLatencyMs)} ms`
      : "Indisponível";

  return createBaseEmbed("Status do Blox Rank BR", DISCORD_THEME.darkBlue).addFields(
    { name: "Bot do Discord", value: gatewayStatus, inline: true },
    { name: "Sistema", value: apiHealthy ? "Funcionando" : "Indisponível", inline: true },
  );
}
