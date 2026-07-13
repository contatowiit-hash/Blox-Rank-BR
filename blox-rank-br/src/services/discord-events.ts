export const DISCORD_OUTBOX_EVENTS = {
  registrationCreated: "registration.created",
  participantRoleGrant: "registration.participant_role_grant",
  administrativeAction: "administrative.action",
} as const;

export type DiscordOutboxEvent =
  (typeof DISCORD_OUTBOX_EVENTS)[keyof typeof DISCORD_OUTBOX_EVENTS];
