import { ConflictError, ValidationError } from "./errors.js";

export const TOURNAMENT_SIZE = 16;
export const TOTAL_ROUNDS = 4;

// Esta ordem mantém os seeds 1 e 2 em lados opostos até uma eventual final.
export const FIRST_ROUND_SEED_ORDER = [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11] as const;

export interface SeededPlayer<T> {
  seed: number;
  player: T;
}

export interface FirstRoundPair<T> {
  bracketPosition: number;
  playerOne: SeededPlayer<T>;
  playerTwo: SeededPlayer<T>;
}

export function buildFirstRoundPairs<T>(playersBySeed: readonly T[]): FirstRoundPair<T>[] {
  if (playersBySeed.length !== TOURNAMENT_SIZE) {
    throw new ValidationError(`São necessários exatamente ${TOURNAMENT_SIZE} jogadores.`);
  }

  const seeded = new Map(playersBySeed.map((player, index) => [index + 1, { seed: index + 1, player }]));
  const pairs: FirstRoundPair<T>[] = [];

  for (let index = 0; index < FIRST_ROUND_SEED_ORDER.length; index += 2) {
    const playerOne = seeded.get(FIRST_ROUND_SEED_ORDER[index]!);
    const playerTwo = seeded.get(FIRST_ROUND_SEED_ORDER[index + 1]!);
    if (playerOne === undefined || playerTwo === undefined) {
      throw new ConflictError("Não foi possível montar o chaveamento.");
    }
    pairs.push({ bracketPosition: index / 2 + 1, playerOne, playerTwo });
  }

  return pairs;
}

export interface NextMatchPlacement {
  round: number;
  bracketPosition: number;
  slot: "player_one" | "player_two";
}

export function getNextMatchPlacement(round: number, bracketPosition: number): NextMatchPlacement | null {
  if (!Number.isInteger(round) || round < 1 || round > TOTAL_ROUNDS) {
    throw new ValidationError("Rodada inválida.");
  }
  const matchesInRound = 2 ** (TOTAL_ROUNDS - round);
  if (!Number.isInteger(bracketPosition) || bracketPosition < 1 || bracketPosition > matchesInRound) {
    throw new ValidationError("Posição inválida no chaveamento.");
  }
  if (round === TOTAL_ROUNDS) {
    return null;
  }
  return {
    round: round + 1,
    bracketPosition: Math.ceil(bracketPosition / 2),
    slot: bracketPosition % 2 === 1 ? "player_one" : "player_two",
  };
}

export function determineWinner<T>(playerOne: T, playerTwo: T, scoreOne: number, scoreTwo: number): {
  winner: T;
  loser: T;
} {
  if (!Number.isInteger(scoreOne) || !Number.isInteger(scoreTwo) || scoreOne < 0 || scoreTwo < 0) {
    throw new ValidationError("Os placares devem ser números inteiros positivos ou zero.");
  }
  if (scoreOne === scoreTwo) {
    throw new ValidationError("A partida precisa ter um vencedor.");
  }
  return scoreOne > scoreTwo
    ? { winner: playerOne, loser: playerTwo }
    : { winner: playerTwo, loser: playerOne };
}

export function getEliminationFinalPosition(round: number): number {
  if (!Number.isInteger(round) || round < 1 || round > TOTAL_ROUNDS) {
    throw new ValidationError("Rodada inválida.");
  }
  return 2 ** (TOTAL_ROUNDS - round) + 1;
}
