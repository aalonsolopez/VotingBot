import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createDiscordClient } from "./discord/client.js";
import { handleCommand } from "./discord/commands/index.js";
import { handleInteraction } from "./discord/interactions/index.js";
import { startPredictionAutoClose } from "./discord/pred/autoClose.js";
import { Events } from "discord.js";

const client = createDiscordClient();

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
  startPredictionAutoClose(client);
});

client.on("error", (e) => {
  console.error("Discord client error:", e);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
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
        // 64 = MessageFlags.Ephemeral
        if (i.deferred || i.replied) await i.followUp({ content: msg, flags: 64 });
        else await i.reply({ content: msg, flags: 64 });
      } catch (err) {
        // Si la interacción ya expiró (10062) o ya fue reconocida (40060), no hay nada que hacer.
        console.error("Además, no se pudo enviar el mensaje de error de la interacción.", err);
      }
    }
  }
});

async function bootstrap() {
  // Calienta Prisma antes de conectar a Discord para evitar bloqueos iniciales
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
