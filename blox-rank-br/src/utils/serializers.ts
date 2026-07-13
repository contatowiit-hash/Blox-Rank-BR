import type { BracketMatch, Match, Registration, Tournament } from "../types/domain.js";

export function serializeRegistration(registration: Registration) {
  return {
    id: registration.id,
    tournament_id: registration.tournamentId,
    roblox_username: registration.robloxUsername,
    discord_user_id: registration.discordUserId,
    discord_username: registration.discordUsername,
    level: registration.level,
    bounty_honor: registration.bountyHonor,
    faction: registration.faction,
    platform: registration.platform,
    main_fruit: registration.mainFruit,
    status: registration.status,
    rejection_reason: registration.rejectionReason,
    approved_by_discord_id: registration.approvedByDiscordId,
    created_at: registration.createdAt.toISOString(),
    updated_at: registration.updatedAt.toISOString(),
  };
}

export function serializeTournament(tournament: Tournament) {
  return {
    id: tournament.id,
    name: tournament.name,
    status: tournament.status,
    max_players: tournament.maxPlayers,
    created_at: tournament.createdAt.toISOString(),
    updated_at: tournament.updatedAt.toISOString(),
  };
}

function serializePublicBracketPlayer(player: BracketMatch["playerOne"]) {
  if (player === null) {
    return null;
  }
  return {
    registration_id: player.registrationId,
    roblox_username: player.robloxUsername,
    seed: player.seed,
  };
}

export function serializeBracketMatch(match: BracketMatch) {
  return {
    id: match.id,
    round: match.round,
    bracket_position: match.bracketPosition,
    player_one: serializePublicBracketPlayer(match.playerOne),
    player_two: serializePublicBracketPlayer(match.playerTwo),
    player_one_score: match.playerOneScore,
    player_two_score: match.playerTwoScore,
    winner: serializePublicBracketPlayer(match.winner),
    status: match.status,
    scheduled_at: match.scheduledAt?.toISOString() ?? null,
  };
}

export function serializeMatch(match: Match) {
  return {
    id: match.id,
    tournament_id: match.tournamentId,
    round: match.round,
    bracket_position: match.bracketPosition,
    player_one_registration_id: match.playerOneRegistrationId,
    player_two_registration_id: match.playerTwoRegistrationId,
    player_one_score: match.playerOneScore,
    player_two_score: match.playerTwoScore,
    winner_registration_id: match.winnerRegistrationId,
    status: match.status,
    scheduled_at: match.scheduledAt?.toISOString() ?? null,
    created_at: match.createdAt.toISOString(),
    updated_at: match.updatedAt.toISOString(),
  };
}
