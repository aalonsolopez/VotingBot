import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";
import { isAdminOrMod } from "../permissions.js";
import { log } from "../../../log.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

export async function predUndo(i: ChatInputCommandInteraction) {
  // Nota: en main.ts ya haces deferReply(ephemeral) para comandos.
  // Aquí SIEMPRE usa respond()/editReply para evitar 40060.

  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  if (!isAdminOrMod(i)) {
    return respond(i, "❌ No tienes permisos para deshacer predicciones.");
  }

  const predictionId = i.options.getString("id", true);
  const guildId = i.guildId!;

  try {
    const pred = await prisma.prediction.findUnique({
      where: { id: predictionId },
      select: { id: true, title: true, guildId: true, status: true },
    });

    if (!pred) return respond(i, "❌ No existe esa predicción.");
    if (pred.guildId !== guildId) return respond(i, "❌ Esa predicción pertenece a otro servidor.");

    if (pred.status !== "RESOLVED") {
      return respond(i, "⚠️ Solo puedes deshacer predicciones en estado RESOLVED.");
    }

    const { affectedUsers, totalDeltaAbs } = await prisma.$transaction(async (tx) => {
      const grouped = await tx.pointsLedger.groupBy({
        by: ["userId"],
        where: { guildId, predictionId },
        _sum: { delta: true },
      });

      const affectedUsers = grouped.map((g) => g.userId);

      // Revertir totales según el ledger (no asumimos +1 fijo)
      for (const g of grouped) {
        const sumDelta = g._sum.delta ?? 0;
        if (sumDelta === 0) continue;

        if (sumDelta > 0) {
          await tx.userPoints.updateMany({
            where: { guildId, userId: g.userId },
            data: { total: { decrement: sumDelta } },
          });
        } else {
          await tx.userPoints.updateMany({
            where: { guildId, userId: g.userId },
            data: { total: { increment: Math.abs(sumDelta) } },
          });
        }
      }

      // Evita negativos en usuarios afectados (best-effort)
      if (affectedUsers.length > 0) {
        await tx.userPoints.updateMany({
          where: { guildId, userId: { in: affectedUsers }, total: { lt: 0 } },
          data: { total: 0 },
        });
      }

      // Borra ledger y resultado
      await tx.pointsLedger.deleteMany({ where: { guildId, predictionId } });
      await tx.predictionResult.deleteMany({ where: { predictionId } });

      // Vuelve a CLOSED (así puedes volver a resolver con el ganador correcto)
      await tx.prediction.update({
        where: { id: predictionId },
        data: { status: "CLOSED" },
      });

      const totalDeltaAbs = grouped.reduce((acc, g) => acc + Math.abs(g._sum.delta ?? 0), 0);

      return { affectedUsers, totalDeltaAbs };
    });

    const embed = new EmbedBuilder()
      .setTitle("↩️ Resolución deshecha")
      .setDescription(
        [
          `**${pred.title}**`,
          `🆔 Prediction ID: \`${pred.id}\``,
          `✅ Estado actualizado a **CLOSED**`,
          affectedUsers.length > 0
            ? `👥 Usuarios afectados: **${affectedUsers.length}** (puntos revertidos: **${totalDeltaAbs}**)`
            : "👥 No había puntos a revertir (nadie acertó o no se registró ledger).",
          "",
          "Ahora puedes volver a ejecutar `/pred resolve` con el ganador correcto.",
        ].join("\n")
      )
      .setColor("#FFA500");

    if (i.deferred) return i.editReply({ embeds: [embed], content: "" });
    return respond(i, "✅ Resolución deshecha.");
  } catch (e) {
    log.error("pred/undo: error", e);
    return respond(i, "❌ No pude deshacer la resolución. Revisa logs del bot (DB/Prisma). ");
  }
}
