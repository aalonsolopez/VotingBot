import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";
import { isAdminOrMod } from "../permissions.js";
import { log } from "../../../log.js";
import { rollbackPointsForPrediction } from "../../../services/tournamentPoints.js";
import { getById as getTournamentById } from "../../../services/tournament.js";

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
      select: { id: true, title: true, guildId: true, status: true, tournamentId: true },
    });

    if (!pred) return respond(i, "❌ No existe esa predicción.");
    if (pred.guildId !== guildId) return respond(i, "❌ Esa predicción pertenece a otro servidor.");

    if (pred.status !== "RESOLVED") {
      return respond(i, "⚠️ Solo puedes deshacer predicciones en estado RESOLVED.");
    }

    // Obtener información del torneo si existe
    let tournamentInfo = "";
    if (pred.tournamentId) {
      try {
        const tournament = await getTournamentById(pred.tournamentId, guildId);
        if (tournament) {
          tournamentInfo = `\n🏆 Torneo: ${tournament.name}`;
        }
      } catch (e) {
        // Ignorar error, continuar sin info de torneo
      }
    }

    // Revertir puntos usando el servicio de tournamentPoints si hay torneo
    if (pred.tournamentId) {
      await rollbackPointsForPrediction(predictionId, pred.tournamentId);
    } else {
      // Para predicciones sin torneo, no hay puntos que revertir (compatibilidad)
      // Borra ledger y resultado
      await prisma.pointsLedger.deleteMany({ where: { guildId, predictionId } });
      await prisma.predictionResult.deleteMany({ where: { predictionId } });
    }

    // Vuelve a CLOSED (así puedes volver a resolver con el ganador correcto)
    await prisma.prediction.update({
      where: { id: predictionId },
      data: { status: "CLOSED" },
    });

    const embed = new EmbedBuilder()
      .setTitle("↩️ Resolución deshecha")
      .setDescription(
        [
          `**${pred.title}**`,
          tournamentInfo,
          `🆔 Prediction ID: \`${pred.id}\``,
          `✅ Estado actualizado a **CLOSED**`,
          pred.tournamentId
            ? "👥 Puntos de torneo revertidos correctamente."
            : "👥 No hay puntos de torneo para revertir (predicción sin torneo).",
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
