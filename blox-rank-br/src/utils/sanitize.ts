const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
const DISCORD_MARKDOWN = /([\\`*_[\]{}()#+\-.!|>~])/g;

export function sanitizeText(value: string): string {
  return value.normalize("NFKC").replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
}

export function escapeDiscordMarkdown(value: string): string {
  return sanitizeText(value).replace(DISCORD_MARKDOWN, "\\$1");
}

export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function sanitizeErrorName(error: unknown): string {
  if (error instanceof Error && error.name.length > 0) {
    return sanitizeText(error.name).slice(0, 80);
  }
  return "UnknownError";
}
