import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminLoginForm } from "@/app/admin/_components/AdminLoginForm";
import { AdminPanel } from "@/app/admin/_components/AdminPanel";

const pendingRegistration = {
  id: "0f5ba3a0-12fc-4a71-91d4-986fb1aab712",
  roblox_username: "JogadorBR",
  discord_username: "jogador",
  level: 2550,
  bounty_honor: 3_500_000,
  faction: "pirate",
  platform: "pc",
  main_fruit: "Portal",
  status: "pending",
  rejection_reason: null,
};

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("painel administrativo", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("envia o login somente ao servidor e não salva credenciais no navegador", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() => json({ error: { message: "Dados inválidos" } }, 401));
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<AdminLoginForm />);
    await userEvent.type(screen.getByLabelText(/Senha administrativa/i), "uma-senha-forte-123");
    fireEvent.submit(screen.getByRole("button", { name: /Entrar com segurança/i }).closest("form")!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ password: "uma-senha-forte-123" });
    expect(storage).not.toHaveBeenCalled();
  });

  it("aprova uma inscrição pendente pela rota protegida", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/session")) return json({ authenticated: true, actor_discord_id: "1171899180390821898" });
      if (init?.method === "PATCH") return json({ data: { ...pendingRegistration, status: "approved" } });
      return json({ data: [pendingRegistration] });
    });
    render(<AdminPanel section="inscricoes" />);
    await userEvent.click(await screen.findByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/status") && init?.method === "PATCH")).toBe(true));
    const call = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/status") && init?.method === "PATCH");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ status: "approved" });
  });

  it("exige e envia motivo ao recusar uma inscrição", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith("/session")) return json({ authenticated: true, actor_discord_id: "1171899180390821898" });
      if (init?.method === "PATCH") return json({ data: { ...pendingRegistration, status: "rejected" } });
      return json({ data: [pendingRegistration] });
    });
    render(<AdminPanel section="inscricoes" />);
    await userEvent.click(await screen.findByRole("button", { name: "Recusar" }));
    await userEvent.type(screen.getByLabelText("Motivo da recusa"), "Dados não conferem");
    await userEvent.click(screen.getByRole("button", { name: "Confirmar recusa" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ status: "rejected", rejection_reason: "Dados não conferem" });
  });
});
