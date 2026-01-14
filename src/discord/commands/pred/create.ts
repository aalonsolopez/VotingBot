import type { ChatInputCommandInteraction } from "discord.js";
import { env } from "#config/env.js";
import { prisma } from "../../../db/prisma.js";
import { buildPredictionMessage } from "../../views/predictionEmbed.js";
import { isAdminOrMod } from "../permissions.js";
import { log } from "../../../log.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

function parseLockAt(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // Formato: DD-MM-YYYY HH:MM (en hora local del servidor)
  // Ej: 12-01-2026 20:00
  const m = /^([0-3]\d)-([0-1]\d)-(\d{4})\s+([0-2]\d):([0-5]\d)$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);

    if (month < 1 || month > 12) return null;
    if (hour > 23) return null;

    const d = new Date(year, month - 1, day, hour, minute, 0, 0);
    // Valida que no haya overflow (p.ej. 31-02-2026)
    if (
      d.getFullYear() !== year ||
      d.getMonth() !== month - 1 ||
      d.getDate() !== day ||
      d.getHours() !== hour ||
      d.getMinutes() !== minute
    ) {
      return null;
    }
    return d;
  }

  // ISO 8601 (con o sin zona)
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d;
}

export async function predCreate(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return i.reply({ content: "Solo en servidores.", flags: 64 });

  if (!isAdminOrMod(i)) {
    return i.reply({ content: "❌ No tienes permisos para crear predicciones.", flags: 64 });
  }

  // Defer lo antes posible para evitar 10062 (Unknown interaction) en operaciones que tardan >3s.
  try {
    await i.deferReply({ flags: 64 });
  } catch (e: any) {
    // 10062: expirada/invalidada; 40060: ya reconocida.
    if (e?.code === 10062) {
      log.warn("pred/create: deferReply falló con 10062 (interacción expirada)", {
        ageMs: Date.now() - i.createdTimestamp,
        guildId: i.guildId,
        channelId: i.channelId,
        userId: i.user?.id,
      });
      return;
    }
    if (e?.code === 40060) {
      log.warn("pred/create: deferReply falló con 40060 (ya reconocida)");
    } else {
      log.error("pred/create: error inesperado en deferReply", e);
      return;
    }
  }

  const title = i.options.getString("title", true);
  const game = i.options.getString("game", false);
  const optionsCsv = i.options.getString("options", true); // "G2,FNC"
  const options = optionsCsv.split(",").map(s => s.trim()).filter(Boolean);
  const lockAtRaw = i.options.getString("lock_at", true);

  let lockTime: Date | null = null;
  lockTime = parseLockAt(lockAtRaw);
  if (!lockTime) {
    return respond(
      i,
      "❌ `lock_at` inválido. Formatos soportados:\n" +
        "- ISO 8601 (recomendado): 2026-01-12T20:00:00+01:00\n" +
        "- DD-MM-YYYY HH:MM (hora local del servidor): 12-01-2026 20:00"
    );
  }

  if (lockTime && lockTime.getTime() <= Date.now()) {
    return respond(i, "❌ La fecha de cierre debe ser futura.");
  }

  if (options.length < 2) {
    return respond(i, "Pon al menos 2 opciones (separadas por coma)." );
  }

  const pred = await prisma.prediction.create({
    data: {
      guildId: i.guildId!,
      channelId: i.channelId!,
      title,
      game,
      lockTime,
      createdBy: i.user.id,
      options: { create: options.map(label => ({ label })) },
    },
    include: { options: true },
  });

  const payload = buildPredictionMessage({
    predictionId: pred.id,
    title: pred.title,
    game: pred.game,
    options: pred.options.map(o => ({ id: o.id, label: o.label })),
  });

  const idsLines = [
    `🆔 Prediction ID: \`${pred.id}\``,
    "", 
    "Opciones:",
    ...pred.options.map(o => `- ${o.label}: \`${o.id}\``),
  ].join("\n");

  try {
    await respond(i, `✅ Predicción creada.\n\n${idsLines}`);
  } catch (e: any) {
    if (e?.code === 10062) {
      log.warn("pred/create: respuesta falló con 10062", { ageMs: Date.now() - i.createdTimestamp });
      return;
    }
    log.error("pred/create: fallo respondiendo a la interacción", e);
    throw e;
  }
  const msg = await i.channel!.send(payload);

  await prisma.prediction.update({
    where: { id: pred.id },
    data: { messageId: msg.id },
  });

  // Publica los IDs en un canal dedicado (si existe y el bot tiene permisos).
  const idsChannelId = env.PRED_IDS_CHANNEL_ID ?? "1460324481661927617";
  const jumpLink = i.guildId ? `https://discord.com/channels/${i.guildId}/${i.channelId}/${msg.id}` : null;
  const lockInfo = pred.lockTime ? `<t:${Math.floor(pred.lockTime.getTime() / 1000)}:F>` : "(sin cierre automático)";

  const logText = [
    "🆔 **IDs de predicción**",
    `Prediction ID: \`${pred.id}\``,
    `Cierre: ${lockInfo}`,
    jumpLink ? `Mensaje: ${jumpLink}` : null,
    "",
    "Opciones:",
    ...pred.options.map(o => `- ${o.label}: \`${o.id}\``),
  ].filter(Boolean).join("\n");

  try {
    const ch = await i.client.channels.fetch(idsChannelId);
    if (ch && ch.isTextBased() && "send" in ch) {
      await ch.send({ content: logText });
    }
  } catch {
    // ignore
  }
}
