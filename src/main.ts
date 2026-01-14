import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { createDiscordClient } from "./discord/client.js";
import { handleCommand } from "./discord/commands/index.js";
import { handleInteraction } from "./discord/interactions/index.js";
import { startPredictionAutoClose } from "./discord/pred/autoClose.js";
import { Events } from "discord.js";
import { log } from "./log.js";

const client = createDiscordClient();

client.once(Events.ClientReady, () => {
  log.info(`✅ Logged in as ${client.user?.tag}`);
  startPredictionAutoClose(client);
});

client.on("error", (e) => {
  log.error("Discord client error:", e);
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (err) => {
  log.error("Uncaught exception:", err);
});

client.on("interactionCreate", async (i) => {
  try {
    if (i.isChatInputCommand()) return await handleCommand(i);
    if (i.isButton()) return await handleInteraction(i);
  } catch (e) {
    log.error(e);
    if (i.isRepliable()) {
      const msg = "❌ Error interno.";
      try {
        // 64 = MessageFlags.Ephemeral
        if (i.deferred || i.replied) await i.followUp({ content: msg, flags: 64 });
        else await i.reply({ content: msg, flags: 64 });
      } catch (err) {
        // Si la interacción ya expiró (10062) o ya fue reconocida (40060), no hay nada que hacer.
        log.error("Además, no se pudo enviar el mensaje de error de la interacción.", err);
      }
    }
  }
});

async function bootstrap() {
  log.info("🚀 Arrancando bot...", {
    node: process.version,
    pid: process.pid,
    logFile: process.env.LOG_FILE ?? null,
  });

  // Calienta Prisma antes de conectar a Discord para evitar bloqueos iniciales
  // justo cuando llegan interacciones (puede provocar 10062 si tardamos >3s).
  try {
    const t0 = Date.now();
    await prisma.$connect();
    log.info(`✅ DB conectada en ${Date.now() - t0}ms`);
  } catch (e) {
    log.error("⚠️ No se pudo conectar a la DB al arrancar.");
    log.error(e);
  }

  log.info("🔌 Login Discord...");
  await client.login(env.DISCORD_TOKEN);
}

void bootstrap();
