import { env } from "./config/env.js";
import { createDiscordClient } from "./discord/client.js";
import { handleCommand } from "./discord/commands/index.js";
import { handleInteraction } from "./discord/interactions/index.js";

const client = createDiscordClient();

client.on("ready", () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
});

client.on("interactionCreate", async (i) => {
  try {
    if (i.isChatInputCommand()) return await handleCommand(i);
    if (i.isButton()) return await handleInteraction(i);
  } catch (e) {
    console.error(e);
    if (i.isRepliable()) {
      const msg = "❌ Error interno.";
      if (i.deferred || i.replied) await i.followUp({ content: msg, ephemeral: true });
      else await i.reply({ content: msg, ephemeral: true });
    }
  }
});

client.login(env.DISCORD_TOKEN);
