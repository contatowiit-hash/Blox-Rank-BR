import { SlashCommandBuilder } from "discord.js";

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

export const commandDefinitions = Object.freeze([
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.registrations)
    .setDescription("Mostra quem ainda aguarda análise da equipe."),
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.approve)
    .setDescription("Aprova um jogador e entrega o cargo de participante.")
    .addUserOption((option) => option.setName("jogador")
      .setDescription("Marque o jogador que será aprovado").setRequired(true)),
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.reject)
    .setDescription("Recusa a inscrição de um jogador.")
    .addUserOption((option) => option.setName("jogador")
      .setDescription("Marque o jogador que será recusado").setRequired(true))
    .addStringOption((option) => option.setName("motivo").setDescription("Explique o motivo da recusa")
      .setMinLength(REJECTION_REASON_MIN_LENGTH).setMaxLength(REJECTION_REASON_MAX_LENGTH).setRequired(true)),
  new SlashCommandBuilder()
    .setName(DISCORD_COMMAND_NAMES.result)
    .setDescription("Registra o placar de uma partida.")
    .addStringOption((option) => option.setName("partida")
      .setDescription("Escolha uma partida pendente").setAutocomplete(true).setRequired(true))
    .addIntegerOption((option) => option.setName("placar_jogador_1")
      .setDescription("Placar do jogador mostrado primeiro").setMinValue(MATCH_SCORE_MIN)
      .setMaxValue(MATCH_SCORE_MAX).setRequired(true))
    .addIntegerOption((option) => option.setName("placar_jogador_2")
      .setDescription("Placar do jogador mostrado segundo").setMinValue(MATCH_SCORE_MIN)
      .setMaxValue(MATCH_SCORE_MAX).setRequired(true)),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.tournament)
    .setDescription("Mostra um resumo do torneio atual."),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.openRegistrations)
    .setDescription("Abre as inscrições do torneio atual."),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.closeRegistrations)
    .setDescription("Encerra as inscrições do torneio atual."),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.generateBracket)
    .setDescription("Gera o chaveamento do torneio atual."),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.participants)
    .setDescription("Mostra os participantes aprovados do torneio atual."),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.bracket)
    .setDescription("Publica o chaveamento do torneio atual."),
  new SlashCommandBuilder().setName(DISCORD_COMMAND_NAMES.ping)
    .setDescription("Mostra a latência do bot e o estado do sistema."),
]);
