import { PermissionFlagsBits } from "discord.js";

const SAFE_PARTICIPANT_PERMISSIONS =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.AttachFiles |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.AddReactions |
  PermissionFlagsBits.UseExternalEmojis |
  PermissionFlagsBits.UseExternalStickers |
  PermissionFlagsBits.Connect |
  PermissionFlagsBits.Speak |
  PermissionFlagsBits.Stream |
  PermissionFlagsBits.UseVAD |
  PermissionFlagsBits.RequestToSpeak |
  PermissionFlagsBits.UseApplicationCommands |
  PermissionFlagsBits.CreatePublicThreads |
  PermissionFlagsBits.CreatePrivateThreads |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.UseEmbeddedActivities |
  PermissionFlagsBits.UseSoundboard |
  PermissionFlagsBits.UseExternalSounds |
  PermissionFlagsBits.SendVoiceMessages |
  PermissionFlagsBits.ChangeNickname;

export function hasUnsafeParticipantPermissions(permissions: bigint): boolean {
  return (permissions & ~SAFE_PARTICIPANT_PERMISSIONS) !== 0n;
}
