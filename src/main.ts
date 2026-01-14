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
    // CRÍTICO: ACK INMEDIATO antes de cualquier procesamiento.
    // - Slash commands: deferReply (ephemeral) para tener 15min
    // - Buttons: deferUpdate para ACK sin reply
    // Esto reduce 10062 (Unknown interaction) y evita flujos incorrectos en botones.
    try {
      if (i.isChatInputCommand()) {
        if (!i.deferred && !i.replied) {
          await i.deferReply({ flags: 64 }); // ephemeral
        }
      } else if (i.isButton()) {
        if (!i.deferred && !i.replied) {
          await i.deferUpdate();
        }
      }
    } catch (e: any) {
      // 10062 => expirada / unknown interaction (muy típico en dev con watch/restarts)
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
      // 40060 => ya estaba acknowledged (doble handler / reintento)
      if (e?.code === 40060) {
        log.warn("Interacción ya acknowledged (se ignora)", {
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

    // Ahora es seguro procesar la interacción
    if (i.isChatInputCommand()) return await handleCommand(i);
    if (i.isButton()) return await handleInteraction(i);
  } catch (e) {
    log.error(e);

    const msg = "❌ Error interno.";

    // Respuesta de error robusta según tipo/estado de ACK
    try {
      if (i.isChatInputCommand()) {
        if (i.deferred) await i.editReply({ content: msg });
        else if (!i.replied) await i.reply({ content: msg, flags: 64 });
        else await i.followUp({ content: msg, flags: 64 });
      } else if (i.isButton()) {
        // Para botones normalmente usamos deferUpdate(). Tras eso, lo más seguro es followUp ephemeral.
        // (Actualizar el mensaje original se debería hacer dentro de handleInteraction vía i.message.edit(...))
        if (!i.replied) await i.followUp({ content: msg, flags: 64 });
      } else if (i.isRepliable()) {
        // Fallback genérico para otros tipos repliables
        if (i.deferred) await i.editReply({ content: msg });
        else await i.followUp({ content: msg, flags: 64 });
      }
    } catch (err) {
      log.error("No se pudo enviar el mensaje de error de la interacción.", err);
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
