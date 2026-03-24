import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";
import { env } from "#config/env.js";
import { isAdminOrMod } from "../permissions.js";
import { resolvePrediction } from "../../../services/prediction.js";
import { getById as getTournamentById } from "../../../services/tournament.js";
import { log } from "../../../log.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

export async function predResolve(i: ChatInputCommandInteraction) {
  // Nota: en main.ts ya haces deferReply(ephemeral) para comandos.
  // Aquí SIEMPRE usa respond()/editReply para evitar 40060.

  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  if (!isAdminOrMod(i)) {
    return respond(i, "❌ No tienes permisos para resolver predicciones.");
  }

  const predictionId = i.options.getString("id", true);
  const winnerOptionId = i.options.getString("winner", true);

  // Obtener la predicción usando el servicio
  const pred = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { options: true },
  });

  if (!pred) return respond(i, "❌ No existe esa predicción.");

  const winnerOpt = pred.options.find((o) => o.id === winnerOptionId);
  if (!winnerOpt) {
    return respond(i, "❌ La opción ganadora no pertenece a esa predicción (Option ID inválido).");
  }

  // Evitar doble resolución (rápido)
  if (pred.status === "RESOLVED") {
    return respond(i, "⚠️ Esa predicción ya estaba resuelta.");
  }

  // Usar el servicio de predicciones para resolver
  let result;
  try {
    result = await resolvePrediction({
      predictionId,
      winnerOptionId,
      resolvedBy: i.user.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "Already resolved") {
      return respond(i, "⚠️ Esa predicción ya estaba resuelta (resultado existente).");
    }
    log.error("pred/resolve: error resolviendo predicción", e);
    return respond(i, "❌ Error al resolver la predicción.");
  }

  // Obtener información del torneo si existe
  let tournamentInfo = "";
  if (pred.tournamentId) {
    try {
      const tournament = await getTournamentById(pred.tournamentId, pred.guildId);
      if (tournament) {
        tournamentInfo = `\n🏆 Torneo: ${tournament.name}`;
      }
    } catch (e) {
      // Ignorar error, continuar sin info de torneo
    }
  }

  // Respuesta efímera al admin/mod
  const embed = new EmbedBuilder()
    .setTitle("✅ Predicción resuelta")
    .setDescription(
      [
        `**${pred.title}**`,
        tournamentInfo,
        `🏁 Ganador: **${winnerOpt.label}**`,
        `🗳️ Votos: **${result.totalVotes}**`,
        `✅ Aciertos: **${result.correctCount}** (+1 punto${pred.tournamentId ? " en torneo" : ""})`,
      ].join("\n")
    )
    .setColor("#57F287");

  try {
    if (i.deferred) await i.editReply({ embeds: [embed], content: "" });
    else await respond(i, "✅ Predicción resuelta."); // fallback muy raro
  } catch (e: any) {
    if (e?.code === 10062) {
      console.warn("pred/resolve: respuesta falló con 10062", { ageMs: Date.now() - i.createdTimestamp });
      // seguimos: el resolve ya se hizo en DB
    } else {
      throw e;
    }
  }

  // Anuncio público (best-effort)
  try {
    const jumpLink = pred.messageId
      ? `https://discord.com/channels/${pred.guildId}/${pred.channelId}/${pred.messageId}`
      : null;

    const publicEmbed = new EmbedBuilder()
      .setTitle("✅ Predicción resuelta")
      .setDescription(
        [ `**${pred.title}**`, tournamentInfo, `🏁 Ganador: **${winnerOpt.label}**`, jumpLink ? `🔗 Mensaje: ${jumpLink}` : null ]
          .filter(Boolean)
          .join("\n")
      )
      .setColor("#57F287");

    const announcementsChannelId = env.ANNOUNCEMENTS_CHANNEL_ID ?? "1400445241533927424";

    // Primero intenta el canal de anuncios; si falla, cae al canal de la predicción.
    const preferred = await i.client.channels.fetch(announcementsChannelId).catch(() => null);
    if (preferred && preferred.isTextBased() && "send" in preferred) {
      await preferred.send({ embeds: [publicEmbed] });
    } else {
      const fallback = await i.client.channels.fetch(pred.channelId).catch(() => null);
      if (fallback && fallback.isTextBased() && "send" in fallback) {
        await fallback.send({ embeds: [publicEmbed] });
      }
    }
  } catch {
    // ignore
  }

  // (Opcional) Editar el mensaje original para reflejar el resultado (best-effort).
  try {
    if (pred.channelId && pred.messageId) {
      const channel = await i.client.channels.fetch(pred.channelId).catch(() => null);
      if (channel && channel.isTextBased() && "messages" in channel) {
        const msg = await channel.messages.fetch(pred.messageId).catch(() => null);
        if (msg) {
          const base = msg.embeds[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder();

          // Evita romper si el embed original no es tuyo / no tiene el formato esperado
          const newEmbed = base
            .setFooter({ text: `PREDICCIÓN CERRADA • El ganador ha sido: ${winnerOpt.label}` })
            .setColor("#cab0ec");

          await msg.edit({ embeds: [newEmbed] });
        }
      }
    }
  } catch {
    // ignore
  }
}
