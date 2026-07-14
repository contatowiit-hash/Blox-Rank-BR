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
  tournament: "torneio",
  openRegistrations: "abrir-inscricoes",
  closeRegistrations: "fechar-inscricoes",
  generateBracket: "gerar-chaveamento",
  participants: "participantes",
  bracket: "chaveamento",
  ping: "ping",
} as const;

export type DiscordCommandName =
  (typeof DISCORD_COMMAND_NAMES)[keyof typeof DISCORD_COMMAND_NAMES];

function registrationOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option
    .setName("inscricao")
    .setDescription("Busque pelo nick do Roblox ou nome no Discord")
    .setAutocomplete(true)
    .setRequired(true);
}

function optionalTournamentOption(option: SlashCommandStringOption): SlashCommandStringOption {
  return option
    .setName("torneio")
    .setDescription("UUID do torneio; deixe vazio para usar o torneio atual")
    .setMinLength(UUID_LENGTH)
    .setMaxLength(UUID_LENGTH)
    .setRequired(false);
}

export const commandDefinitions = Object.freeze([
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.registrations)
    .setDescription("Mostra as inscrições que ainda aguardam análise da equipe."),
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.approve)
    .setDescription("Aprova uma inscrição e entrega o cargo de participante.")
    .addStringOption(registrationOption),
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.reject)
    .setDescription("Recusa uma inscrição e registra o motivo.")
    .addStringOption(registrationOption)
    .addStringOption((option) => option.setName("motivo").setDescription("Motivo da recusa")
      .setMinLength(REJECTION_REASON_MIN_LENGTH).setMaxLength(REJECTION_REASON_MAX_LENGTH).setRequired(true)),
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.result)
    .setDescription("Registra o placar de uma partida do torneio.")
    .addStringOption((option) => option.setName("partida").setDescription("Busque uma partida pendente")
      .setAutocomplete(true).setRequired(true))
    .addIntegerOption((option) => option.setName("placar_jogador_1").setDescription("Pontos do primeiro jogador")
      .setMinValue(MATCH_SCORE_MIN).setMaxValue(MATCH_SCORE_MAX).setRequired(true))
    .addIntegerOption((option) => option.setName("placar_jogador_2").setDescription("Pontos do segundo jogador")
      .setMinValue(MATCH_SCORE_MIN).setMaxValue(MATCH_SCORE_MAX).setRequired(true)),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.tournament)
    .setDescription("Mostra um resumo do torneio atual."),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.openRegistrations)
    .setDescription("Abre ou reabre as inscrições de um torneio.").addStringOption(optionalTournamentOption),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.closeRegistrations)
    .setDescription("Encerra as inscrições de um torneio.").addStringOption(optionalTournamentOption),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.generateBracket)
    .setDescription("Gera o chaveamento do torneio.").addStringOption(optionalTournamentOption),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.participants)
    .setDescription("Mostra os participantes aprovados.").addStringOption(optionalTournamentOption),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.bracket)
    .setDescription("Publica o chaveamento do torneio atual.").addStringOption(optionalTournamentOption),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.ping)
    .setDescription("Mostra a latência do bot e o estado da API."),
]);
