import type { BackendRegistration, PublicParticipant } from "./types";

export function sanitizeApprovedParticipants(
  registrations: readonly BackendRegistration[],
  tournamentId: string,
): PublicParticipant[] {
  return registrations
    .filter(
      (registration) =>
        registration.status === "approved" && registration.tournament_id === tournamentId,
    )
    .map((registration) => ({
      id: registration.id,
      tournament_id: registration.tournament_id,
      roblox_username: registration.roblox_username,
      level: registration.level,
      bounty_honor: registration.bounty_honor,
      faction: registration.faction,
      platform: registration.platform,
      main_fruit: registration.main_fruit,
    }))
    .sort(
      (left, right) =>
        right.bounty_honor - left.bounty_honor ||
        left.roblox_username.localeCompare(right.roblox_username, "pt-BR", { sensitivity: "base" }) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 16);
}
