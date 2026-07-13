import { SlashCommandBuilder, type SlashCommandStringOption } from "discord.js";

const UUID_LENGTH = 36;
const REJECTION_REASON_MIN_LENGTH = 3;
const REJECTION_REASON_MAX_LENGTH = 500;
const MATCH_SCORE_MIN = 0;
const MATCH_SCORE_MAX = 100;

export const DISCORD_COMMAND_NAMES = {
  registrations: "inscricoes",
  approve: "aprovar",
  reject: "recusar",
  result: "resultado",
  bracket: "chaveamento",
  ping: "ping",
} as const;

export type DiscordCommandName =
  (typeof DISCORD_COMMAND_NAMES)[keyof typeof DISCORD_COMMAND_NAMES];

function configureRegistrationIdOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option
    .setName("inscricao")
    .setDescription("Código da inscrição")
    .setMinLength(UUID_LENGTH)
    .setMaxLength(UUID_LENGTH)
    .setRequired(true);
}

export const commandDefinitions = Object.freeze([
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.registrations)
    .setDescription("Mostra as inscrições que ainda aguardam análise da equipe."),

  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.approve)
    .setDescription("Aprova uma inscrição e entrega o cargo de participante.")
    .addStringOption(configureRegistrationIdOption),

  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.reject)
    .setDescription("Recusa uma inscrição e registra o motivo.")
    .addStringOption(configureRegistrationIdOption)
    .addStringOption((option) =>
      option
        .setName("motivo")
        .setDescription("Motivo que será informado no registro da recusa")
        .setMinLength(REJECTION_REASON_MIN_LENGTH)
        .setMaxLength(REJECTION_REASON_MAX_LENGTH)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.result)
    .setDescription("Registra o placar de uma partida do torneio.")
    .addStringOption((option) =>
      option
        .setName("partida")
        .setDescription("Código da partida")
        .setMinLength(UUID_LENGTH)
        .setMaxLength(UUID_LENGTH)
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("placar_jogador_1")
        .setDescription("Pontos do primeiro jogador")
        .setMinValue(MATCH_SCORE_MIN)
        .setMaxValue(MATCH_SCORE_MAX)
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("placar_jogador_2")
        .setDescription("Pontos do segundo jogador")
        .setMinValue(MATCH_SCORE_MIN)
        .setMaxValue(MATCH_SCORE_MAX)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.bracket)
    .setDescription("Publica o chaveamento do torneio atual."),

  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.ping)
    .setDescription("Mostra a latência do bot e o estado da API."),
]);
