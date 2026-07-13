import "dotenv/config";
import { isIP } from "node:net";
import { z } from "zod";

const snowflakeSchema = z.string().regex(/^\d{17,20}$/, "deve ser um ID válido do Discord");

const booleanSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

function isTrustedProxyAddress(value: string): boolean {
  const [address, prefix, extra] = value.split("/");
  if (address === undefined || extra !== undefined) {
    return false;
  }
  const version = isIP(address);
  if (version === 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  if (!/^\d{1,3}$/.test(prefix)) {
    return false;
  }
  const bits = Number(prefix);
  return bits >= 0 && bits <= (version === 4 ? 32 : 128);
}

const trustProxySchema = z.string().default("false").transform((value, context) => {
  const normalized = value.trim();
  if (normalized === "false") {
    return false as const;
  }
  if (/^\d+$/.test(normalized)) {
    const hops = Number(normalized);
    if (hops >= 1 && hops <= 10) {
      return hops;
    }
  }
  const addresses = normalized.split(",").map((address) => address.trim()).filter(Boolean);
  if (addresses.length > 0 && addresses.every(isTrustedProxyAddress)) {
    return addresses;
  }
  context.addIssue({
    code: "custom",
    message: "use false, uma quantidade de saltos ou IPs/CIDRs confiáveis; true não é aceito",
  });
  return z.NEVER;
});

const databaseUrlSchema = z.string().min(1).superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
      context.addIssue({ code: "custom", message: "deve usar postgresql://" });
    }
    if ([...url.searchParams.keys()].some((key) => key.toLowerCase().startsWith("ssl"))) {
      context.addIssue({
        code: "custom",
        message: "não deve conter parâmetros SSL; use apenas DATABASE_SSL",
      });
    }
  } catch {
    context.addIssue({ code: "custom", message: "deve ser uma URL PostgreSQL válida" });
  }
});

const corsOriginsSchema = z.string().min(1).transform((value, context) => {
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const normalized = new Set<string>();
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!(["http:", "https:"] as string[]).includes(url.protocol) || url.origin !== origin.replace(/\/$/, "")) {
        throw new Error("invalid origin");
      }
      normalized.add(url.origin);
    } catch {
      context.addIssue({
        code: "custom",
        message: "deve conter apenas origens HTTP(S), separadas por vírgula e sem caminhos",
      });
      return z.NEVER;
    }
  }

  if (normalized.size === 0) {
    context.addIssue({ code: "custom", message: "deve conter ao menos uma origem" });
    return z.NEVER;
  }

  return [...normalized];
});

const discordFields = {
  DISCORD_BOT_TOKEN: z
    .string()
    .min(20, "é obrigatório")
    .refine((value) => !/replace|change-me/i.test(value), "deve ser substituído pelo token real"),
  DISCORD_APPLICATION_ID: snowflakeSchema,
  DISCORD_GUILD_ID: snowflakeSchema,
  DISCORD_STAFF_ROLE_ID: snowflakeSchema,
  DISCORD_PARTICIPANT_ROLE_ID: snowflakeSchema,
  DISCORD_INSCRICOES_CHANNEL_ID: snowflakeSchema,
  DISCORD_LOGS_CHANNEL_ID: snowflakeSchema,
} as const;

const appEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    TRUST_PROXY: trustProxySchema,
    DATABASE_URL: databaseUrlSchema,
    DATABASE_SSL: booleanSchema,
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(20_000),
    DATABASE_LOCK_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(5_000),
    DATABASE_IDLE_TRANSACTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(300_000)
      .default(30_000),
    API_SECRET: z
      .string()
      .min(32, "deve ter no mínimo 32 caracteres")
      .refine((value) => !/replace|change-me/i.test(value), "deve ser substituído por um segredo aleatório"),
    CORS_ORIGINS: corsOriginsSchema,
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10_000).default(100),
    RATE_LIMIT_WINDOW: z.string().min(1).max(40).default("1 minute"),
    REGISTRATION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).max(60_000).default(3_000),
    ...discordFields,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !value.DATABASE_SSL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_SSL"],
        message: "deve ser true em produção",
      });
    }
  })
  .readonly();

const commandRegistrationEnvSchema = z
  .object({
    DISCORD_BOT_TOKEN: discordFields.DISCORD_BOT_TOKEN,
    DISCORD_APPLICATION_ID: discordFields.DISCORD_APPLICATION_ID,
    DISCORD_GUILD_ID: discordFields.DISCORD_GUILD_ID,
  })
  .readonly();

const databaseMigrationEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: databaseUrlSchema,
    DATABASE_SSL: booleanSchema,
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production" && !value.DATABASE_SSL) {
      context.addIssue({
        code: "custom",
        path: ["DATABASE_SSL"],
        message: "deve ser true em produção",
      });
    }
  })
  .readonly();

export type AppEnv = z.infer<typeof appEnvSchema>;
export type CommandRegistrationEnv = z.infer<typeof commandRegistrationEnvSchema>;
export type DatabaseMigrationEnv = z.infer<typeof databaseMigrationEnvSchema>;

export class EnvironmentConfigurationError extends Error {
  override readonly name = "EnvironmentConfigurationError";
}

function parseEnvironment<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data;
  }

  const fields = [...new Set(result.error.issues.map((issue) => issue.path.join(".")).filter(Boolean))];
  throw new EnvironmentConfigurationError(
    `Configuração inválida. Revise as variáveis: ${fields.join(", ")}`,
  );
}

export function loadAppEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return parseEnvironment(appEnvSchema, source);
}

export function loadCommandRegistrationEnv(
  source: NodeJS.ProcessEnv = process.env,
): CommandRegistrationEnv {
  return parseEnvironment(commandRegistrationEnvSchema, source);
}

export function loadDatabaseMigrationEnv(
  source: NodeJS.ProcessEnv = process.env,
): DatabaseMigrationEnv {
  return parseEnvironment(databaseMigrationEnvSchema, source);
}
