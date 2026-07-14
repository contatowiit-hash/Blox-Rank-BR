import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BracketBoard } from "@/app/components/BracketBoard";
import { ParticipantsGrid } from "@/app/components/ParticipantsGrid";
import { RegistrationForm } from "@/app/components/RegistrationForm";

function response(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));
}

async function fillValidRegistration() {
  await userEvent.type(screen.getByLabelText(/Nome no Roblox/i), "Jogador_BR");
  await userEvent.type(screen.getByLabelText(/^Nível/i), "2550");
  await userEvent.type(screen.getByLabelText(/Bounty ou Honor/i), "3500000");
  await userEvent.type(screen.getByLabelText(/Fruta principal/i), "Portal");
  await userEvent.type(screen.getByLabelText(/Nome no Discord/i), "jogador.br");
  await userEvent.type(screen.getByLabelText(/ID do Discord/i), "1171899180390821898");
}

describe("inscrição pública", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("valida os campos antes de enviar", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<RegistrationForm />);
    fireEvent.submit(screen.getByRole("button", { name: /Enviar inscrição/i }).closest("form")!);
    expect(await screen.findByText("Revise os campos destacados.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explica quando Discord ou nick já possui inscrição", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ error: { code: "CONFLICT", message: "Já existe uma inscrição com este Discord ou nome do Roblox." } }, 409));
    render(<RegistrationForm />);
    await fillValidRegistration();
    await userEvent.click(screen.getByRole("button", { name: /Enviar inscrição/i }));
    expect(await screen.findByText("Já existe uma inscrição com este Discord ou nome do Roblox.")).toBeInTheDocument();
  });

  it("mantém o formulário utilizável quando a API está offline", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<RegistrationForm />);
    await fillValidRegistration();
    await userEvent.click(screen.getByRole("button", { name: /Enviar inscrição/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível enviar sua inscrição");
    expect(screen.getByRole("button", { name: /Enviar inscrição/i })).toBeEnabled();
  });
});

describe("dados públicos", () => {
  it("exibe participantes aprovados sem dados do Discord", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => String(input).includes("chaveamento")
      ? response({ data: { tournament: { id: "22222222-2222-4222-8222-222222222222", name: "Blox Rank BR", status: "registrations_open", max_players: 16, created_at: "2026-07-12T12:00:00.000Z", updated_at: "2026-07-12T12:00:00.000Z" }, matches: [] } })
      : response({ data: [{
      id: "11111111-1111-4111-8111-111111111111",
      tournament_id: "22222222-2222-4222-8222-222222222222",
      roblox_username: "Jogador_BR",
      level: 2550,
      bounty_honor: 3_500_000,
      faction: "pirate",
      platform: "pc",
      main_fruit: "Portal",
      }] }));
    render(<ParticipantsGrid />);
    expect(await screen.findByText("Jogador_BR")).toBeInTheDocument();
    expect(screen.queryByText(/1171899180390821898/)).not.toBeInTheDocument();
  });

  it("exibe jogadores, placar e vencedor no chaveamento", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => response({ data: {
      tournament: { id: "22222222-2222-4222-8222-222222222222", name: "Blox Rank BR", status: "active", max_players: 16, created_at: "2026-07-12T12:00:00.000Z", updated_at: "2026-07-12T12:00:00.000Z" },
      matches: [{
        id: "33333333-3333-4333-8333-333333333333", round: 1, bracket_position: 1,
        player_one: { registration_id: "11111111-1111-4111-8111-111111111111", roblox_username: "Vencedor_BR", seed: 1 },
        player_two: { registration_id: "44444444-4444-4444-8444-444444444444", roblox_username: "Desafiante_BR", seed: 16 },
        player_one_score: 2, player_two_score: 0,
        winner: { registration_id: "11111111-1111-4111-8111-111111111111", roblox_username: "Vencedor_BR", seed: 1 },
        status: "completed", scheduled_at: null,
      }],
    } }));
    render(<BracketBoard />);
    expect(await screen.findByText("Vencedor_BR")).toBeInTheDocument();
    expect(screen.getByLabelText("Vencedor")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Finalizada")).toBeInTheDocument());
  });
});
