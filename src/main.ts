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
    // CRÍTICO: Defer INMEDIATAMENTE antes de cualquier procesamiento.
    // Esto previene 10062 (Unknown interaction) en operaciones que tarden >3s.
    if (i.isRepliable() && !i.deferred && !i.replied) {
      try {
        // Defer con ephemeral=true por defecto (los comandos específicos pueden rechazar después)
        await i.deferReply({ flags: 64 });
      } catch (e: any) {
        // Si falla el defer, la interacción expiró. Log y termina.
        if (e?.code === 10062) {
          log.warn("Interacción expirada antes de poder hacer defer", {
            type: i.type,
            isCommand: i.isChatInputCommand?.(),
            isButton: i.isButton?.(),
            ageMs: Date.now() - i.createdTimestamp,
            userId: i.user?.id,
          });
          return;
        }
        throw e;
      }
    }

    // Ahora es seguro procesar la interacción (tenemos 15 min para responder)
    if (i.isChatInputCommand()) return await handleCommand(i);
    if (i.isButton()) return await handleInteraction(i);
  } catch (e) {
    log.error(e);
    if (i.isRepliable()) {
      const msg = "❌ Error interno.";
      try {
        // Ahora siempre está deferred, así que usar editReply
        if (i.deferred) await i.editReply({ content: msg });
        else await i.followUp({ content: msg, flags: 64 });
      } catch (err) {
        // Si no se puede enviar el error, solo log.
        log.error("No se pudo enviar el mensaje de error de la interacción.", err);
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
