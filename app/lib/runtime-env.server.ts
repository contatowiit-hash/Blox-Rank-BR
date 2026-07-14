import "server-only";

import { env } from "cloudflare:workers";

export const serverEnvironment = env as Readonly<Record<string, string | undefined>>;
