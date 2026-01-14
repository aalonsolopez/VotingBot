import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";
import { env } from "#config/env.js";
import { isAdminOrMod } from "../permissions.js";

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

  // Validar que existe y que la opción ganadora pertenece a la predicción
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

  // Regla de puntos (MVP): +1 por acierto, 0 por fallo.
  const result = await prisma
    .$transaction(async (tx) => {
      // Evitar doble resolución a nivel transaccional
      const existingResult = await tx.predictionResult.findUnique({
        where: { predictionId: pred.id },
      });
      if (existingResult) {
        throw new Error("ALREADY_RESOLVED");
      }

      const votes = await tx.vote.findMany({
        where: { predictionId: pred.id },
        select: { userId: true, optionId: true },
      });

      const totalVotes = votes.length;
      const correctUserIds = votes.filter((v) => v.optionId === winnerOptionId).map((v) => v.userId);

      // Marca resuelta + guarda resultado
      await tx.prediction.update({
        where: { id: pred.id },
        data: { status: "RESOLVED" },
      });

      await tx.predictionResult.create({
        data: {
          predictionId: pred.id,
          winnerOptionId,
          resolvedBy: i.user.id,
        },
      });

      // Ledger + puntos
      if (correctUserIds.length > 0) {
        // Incrementa 1 a los existentes
        await tx.userPoints.updateMany({
          where: { guildId: pred.guildId, userId: { in: correctUserIds } },
          data: { total: { increment: 1 } },
        });

        // Crea los que no existían
        // (Hacemos prefetch para evitar createMany masivo innecesario; igualmente usamos skipDuplicates)
        const existing = await tx.userPoints.findMany({
          where: { guildId: pred.guildId, userId: { in: correctUserIds } },
          select: { userId: true },
        });
        const existingSet = new Set(existing.map((e) => e.userId));
        const toCreate = correctUserIds.filter((uid) => !existingSet.has(uid));

        if (toCreate.length > 0) {
          await tx.userPoints.createMany({
            data: toCreate.map((uid) => ({ guildId: pred.guildId, userId: uid, total: 1 })),
            skipDuplicates: true,
          });
        }

        // Ledger (1 entrada por usuario correcto)
        await tx.pointsLedger.createMany({
          data: correctUserIds.map((uid) => ({
            guildId: pred.guildId,
            userId: uid,
            predictionId: pred.id,
            delta: 1,
            reason: `Correct prediction (${winnerOpt.label})`,
          })),
        });
      }

      return {
        totalVotes,
        correctCount: correctUserIds.length,
      };
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "ALREADY_RESOLVED") return null;
      throw e;
    });

  if (result === null) {
    return respond(i, "⚠️ Esa predicción ya estaba resuelta (resultado existente).");
  }

  // Respuesta efímera al admin/mod
  const embed = new EmbedBuilder()
    .setTitle("✅ Predicción resuelta")
    .setDescription(
      [
        `**${pred.title}**`,
        `🏁 Ganador: **${winnerOpt.label}**`,
        `🗳️ Votos: **${result.totalVotes}**`,
        `✅ Aciertos: **${result.correctCount}** (+1 punto)`,
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
        [ `**${pred.title}**`, `🏁 Ganador: **${winnerOpt.label}**`, jumpLink ? `🔗 Mensaje: ${jumpLink}` : null ]
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
