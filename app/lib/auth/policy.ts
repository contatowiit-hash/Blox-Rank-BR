export const DISCORD_ID_PATTERN = /^\d{17,20}$/u;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class AdminRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminRequestError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isSameOriginAdminRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return false;
  }
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      return false;
    }
  } catch {
    return false;
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "same-origin" || fetchSite === "none";
}

export function assertSameOriginAdminRequest(request: Request): void {
  if (!isSameOriginAdminRequest(request)) {
    throw new AdminRequestError(403, "CSRF_BLOCKED", "A origem da ação não é válida.");
  }
}

export function assertUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new AdminRequestError(400, "INVALID_ID", "O identificador informado é inválido.");
  }
  return value.toLowerCase();
}

export function parseLoginBody(value: unknown): {
  password: string;
} {
  if (!isPlainObject(value)) {
    throw new AdminRequestError(400, "INVALID_LOGIN", "Confira os dados de acesso.");
  }
  const password = value.password;
  if (
    typeof password !== "string" ||
    password.length < 1 ||
    password.length > 256
  ) {
    throw new AdminRequestError(400, "INVALID_LOGIN", "Confira os dados de acesso.");
  }
  return { password };
}

export function parseRegistrationStatusBody(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new AdminRequestError(400, "INVALID_STATUS", "Confira a decisão informada.");
  }
  if (value.status === "approved") {
    if (value.rejection_reason !== undefined) {
      throw new AdminRequestError(400, "INVALID_STATUS", "A aprovação não recebe motivo.");
    }
    return { status: "approved" };
  }
  if (value.status === "rejected" && typeof value.rejection_reason === "string") {
    const reason = cleanText(value.rejection_reason);
    if (reason.length >= 3 && reason.length <= 500) {
      return { status: "rejected", rejection_reason: reason };
    }
  }
  throw new AdminRequestError(400, "INVALID_STATUS", "Confira a decisão informada.");
}

export function parseMatchResultBody(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) {
    throw new AdminRequestError(400, "INVALID_RESULT", "Confira o placar informado.");
  }
  const playerOneScore = value.player_one_score;
  const playerTwoScore = value.player_two_score;
  if (
    typeof playerOneScore !== "number" ||
    !Number.isInteger(playerOneScore) ||
    playerOneScore < 0 ||
    playerOneScore > 100 ||
    typeof playerTwoScore !== "number" ||
    !Number.isInteger(playerTwoScore) ||
    playerTwoScore < 0 ||
    playerTwoScore > 100 ||
    playerOneScore === playerTwoScore
  ) {
    throw new AdminRequestError(400, "INVALID_RESULT", "Confira o placar informado.");
  }
  return {
    player_one_score: playerOneScore,
    player_two_score: playerTwoScore,
  };
}

export function buildRegistrationQuery(searchParams: URLSearchParams): string {
  const allowed = new Set(["page", "limit", "status", "tournament_id"]);
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new AdminRequestError(400, "INVALID_QUERY", "A busca contém um filtro inválido.");
    }
  }

  const output = new URLSearchParams();
  const page = searchParams.get("page");
  if (page !== null) {
    const parsed = Number(page);
    if (!/^\d+$/u.test(page) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10_000) {
      throw new AdminRequestError(400, "INVALID_QUERY", "A página informada é inválida.");
    }
    output.set("page", String(parsed));
  }
  const limit = searchParams.get("limit");
  if (limit !== null) {
    const parsed = Number(limit);
    if (!/^\d+$/u.test(limit) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new AdminRequestError(400, "INVALID_QUERY", "O limite informado é inválido.");
    }
    output.set("limit", String(parsed));
  }
  const status = searchParams.get("status");
  if (status !== null) {
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new AdminRequestError(400, "INVALID_QUERY", "O status informado é inválido.");
    }
    output.set("status", status);
  }
  const tournamentId = searchParams.get("tournament_id");
  if (tournamentId !== null) {
    output.set("tournament_id", assertUuid(tournamentId));
  }
  const query = output.toString();
  return query === "" ? "" : `?${query}`;
}
