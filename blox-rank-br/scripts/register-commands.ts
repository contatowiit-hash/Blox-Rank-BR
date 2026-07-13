import { REST, Routes } from "discord.js";
import { commandDefinitions } from "../src/commands/definitions.js";
import { loadCommandRegistrationEnv } from "../src/config/env.js";
import { sanitizeErrorName } from "../src/utils/sanitize.js";

async function registerGuildCommands(): Promise<void> {
  const env = loadCommandRegistrationEnv();
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_BOT_TOKEN);
  const body = commandDefinitions.map((command) => command.toJSON());

  await rest.put(
    Routes.applicationGuildCommands(env.DISCORD_APPLICATION_ID, env.DISCORD_GUILD_ID),
    { body },
  );

  console.info(
    JSON.stringify({
      level: "info",
      event: "discord.guild_commands.registered",
      commandCount: body.length,
    }),
  );
}

try {
  await registerGuildCommands();
} catch (error: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      event: "discord.guild_commands.registration_failed",
      errorType: sanitizeErrorName(error),
    }),
  );
  process.exitCode = 1;
}
