export type TournamentStatus =
  | "draft"
  | "registrations_open"
  | "registrations_closed"
  | "active"
  | "finished";

export interface PublicTournament {
  id: string;
  name: string;
  status: TournamentStatus;
  max_players: number;
  created_at: string;
  updated_at: string;
}

export interface BracketPlayer {
  registration_id: string;
  roblox_username: string;
  seed: number;
}

export interface BracketMatch {
  id: string;
  round: number;
  bracket_position: number;
  player_one: BracketPlayer | null;
  player_two: BracketPlayer | null;
  player_one_score: number | null;
  player_two_score: number | null;
  winner: BracketPlayer | null;
  status: "pending" | "scheduled" | "completed" | "cancelled";
  scheduled_at: string | null;
}

export interface PublicBracket {
  tournament: PublicTournament;
  matches: BracketMatch[];
}

export interface PublicParticipant {
  id: string;
  tournament_id: string;
  roblox_username: string;
  level: number;
  bounty_honor: number;
  faction: "pirate" | "marine";
  platform: "pc" | "mobile" | "console";
  main_fruit: string;
}

export interface PublicApiIssue {
  field?: string;
  path?: string;
  message: string;
}

export interface PublicApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    issues?: PublicApiIssue[];
  };
}

export class PublicApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly issues: PublicApiIssue[];

  constructor(message: string, status: number, code?: string, issues: PublicApiIssue[] = []) {
    super(message);
    this.name = "PublicApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export async function fetchPublicData<T>(
  path: string,
  init?: RequestInit,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    signal,
    headers: {
      Accept: "application/json",
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | ({ data?: T } & PublicApiErrorBody)
    | null;

  if (!response.ok) {
    throw new PublicApiError(
      body?.error?.message || "Não foi possível carregar as informações agora.",
      response.status,
      body?.error?.code,
      body?.error?.issues ?? [],
    );
  }

  if (body === null || !("data" in body)) {
    throw new PublicApiError("A resposta recebida está incompleta.", response.status);
  }

  return body.data as T;
}

export const tournamentStatusLabels: Record<TournamentStatus, string> = {
  draft: "Em preparação",
  registrations_open: "Inscrições abertas",
  registrations_closed: "Inscrições encerradas",
  active: "Em andamento",
  finished: "Finalizado",
};

export const factionLabels = { pirate: "Pirata", marine: "Marinheiro" } as const;
export const platformLabels = { pc: "PC", mobile: "Celular", console: "Console" } as const;

export function formatBounty(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}
