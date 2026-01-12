import type { ChatInputCommandInteraction } from "discord.js";
import { env } from "#config/env.js";
import { prisma } from "../../../db/prisma.js";
import { buildPredictionMessage } from "../../views/predictionEmbed.js";
import { isAdminOrMod } from "../permissions.js";

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
  if (!i.inGuild()) return i.reply({ content: "Solo en servidores.", ephemeral: true });

  if (!isAdminOrMod(i)) {
    return i.reply({ content: "❌ No tienes permisos para crear predicciones.", ephemeral: true });
  }

  const title = i.options.getString("title", true);
  const game = i.options.getString("game", false);
  const optionsCsv = i.options.getString("options", true); // "G2,FNC"
  const options = optionsCsv.split(",").map(s => s.trim()).filter(Boolean);
  const lockAtRaw = i.options.getString("lock_at", true);

  let lockTime: Date | null = null;
  lockTime = parseLockAt(lockAtRaw);
  if (!lockTime) {
    return i.reply({
      content:
        "❌ `lock_at` inválido. Formatos soportados:\n" +
        "- ISO 8601 (recomendado): 2026-01-12T20:00:00+01:00\n" +
        "- DD-MM-YYYY HH:MM (hora local del servidor): 12-01-2026 20:00",
      ephemeral: true,
    });
  }

  if (lockTime && lockTime.getTime() <= Date.now()) {
    return i.reply({ content: "❌ La fecha de cierre debe ser futura.", ephemeral: true });
  }

  if (options.length < 2) {
    return i.reply({ content: "Pon al menos 2 opciones (separadas por coma).", ephemeral: true });
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

  await i.reply({
    content: `✅ Predicción creada.\n\n${idsLines}`,
    ephemeral: true,
  });
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
