import { describe, expect, it } from "vitest";
import {
  buildFirstRoundPairs,
  determineWinner,
  FIRST_ROUND_SEED_ORDER,
  getEliminationFinalPosition,
  getNextMatchPlacement,
} from "../src/utils/bracket.js";

describe("regras do chaveamento", () => {
  it("combina todos os 16 seeds e mantém os dois melhores em lados opostos", () => {
    const pairs = buildFirstRoundPairs(Array.from({ length: 16 }, (_, index) => `jogador-${index + 1}`));

    expect(FIRST_ROUND_SEED_ORDER).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
    expect(pairs.map(({ playerOne, playerTwo }) => [playerOne.seed, playerTwo.seed])).toEqual([
      [1, 16],
      [8, 9],
      [4, 13],
      [5, 12],
      [2, 15],
      [7, 10],
      [3, 14],
      [6, 11],
    ]);
    expect(getNextMatchPlacement(1, 1)).toEqual({ round: 2, bracketPosition: 1, slot: "player_one" });
    expect(getNextMatchPlacement(1, 2)).toEqual({ round: 2, bracketPosition: 1, slot: "player_two" });
    expect(getNextMatchPlacement(1, 5)).toEqual({ round: 2, bracketPosition: 3, slot: "player_one" });
    expect(getNextMatchPlacement(4, 1)).toBeNull();
  });

  it("exige exatamente 16 jogadores", () => {
    expect(() => buildFirstRoundPairs(Array.from({ length: 15 }, (_, index) => index))).toThrow(
      "exatamente 16",
    );
    expect(() => buildFirstRoundPairs(Array.from({ length: 17 }, (_, index) => index))).toThrow(
      "exatamente 16",
    );
  });

  it("calcula vencedor e posições finais sem aceitar empate", () => {
    expect(determineWinner("A", "B", 3, 1)).toEqual({ winner: "A", loser: "B" });
    expect(determineWinner("A", "B", 0, 2)).toEqual({ winner: "B", loser: "A" });
    expect(() => determineWinner("A", "B", 2, 2)).toThrow("vencedor");
    expect([1, 2, 3, 4].map(getEliminationFinalPosition)).toEqual([9, 5, 3, 2]);
  });
});
