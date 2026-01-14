import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createDiscordClient } from "./discord/client.js";
import { handleCommand } from "./discord/commands/index.js";
import { handleInteraction } from "./discord/interactions/index.js";
import { startPredictionAutoClose } from "./discord/pred/autoClose.js";

const client = createDiscordClient();

client.once("clientReady", () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  startPredictionAutoClose(client);
});

client.on("interactionCreate", async (i) => {
  try {
    if (i.isChatInputCommand()) return await handleCommand(i);
    if (i.isButton()) return await handleInteraction(i);
  } catch (e) {
    console.error(e);
    if (i.isRepliable()) {
      const msg = "❌ Error interno.";
      try {
        if (i.deferred || i.replied) await i.followUp({ content: msg, ephemeral: true });
        else await i.reply({ content: msg, ephemeral: true });
      } catch {
        // Si la interacción ya expiró o ya fue reconocida, no hay nada que hacer.
        console.error("Además, no se pudo enviar el mensaje de error de la interacción.");
      }
    }
  }
});

async function bootstrap() {
  // Calienta Prisma antes de conectar a Discord para evitar bloquear el event loop
  // justo cuando llegan interacciones (puede provocar 10062 si tardamos >3s).
  try {
    await prisma.$connect();
  } catch (e) {
    console.error("⚠️ No se pudo conectar a la DB al arrancar.");
    console.error(e);
  }

  await client.login(env.DISCORD_TOKEN);
}

void bootstrap();
