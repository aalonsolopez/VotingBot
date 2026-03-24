import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { getPredictionById } from "../../../services/prediction.js";
import { getById as getTournamentById } from "../../../services/tournament.js";
import { prisma } from "#db/prisma.js";
import { log } from "#src/log.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

export async function predStats(i: ChatInputCommandInteraction) {
  // Nota: en main.ts ya haces deferReply(ephemeral) para comandos.
  // Aquí SIEMPRE responde con respond()/editReply para evitar 40060.

  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  const predictionId = i.options.getString("id", true);

  const pred = await getPredictionById(predictionId);

  if (!pred) {
    return respond(i, "❌ No existe esa predicción.");
  }

  // Obtener información del torneo si existe
  let tournamentName = "";
  if (pred.tournamentId) {
    try {
      const tournament = await getTournamentById(pred.tournamentId, i.guildId!);
      if (tournament) {
        tournamentName = ` - ${tournament.name}`;
      }
    } catch (e) {
      // Ignorar error, continuar sin info de torneo
    }
  }

  const grouped = await prisma.vote.groupBy({
    by: ["optionId"],
    where: { predictionId: pred.id },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const g of grouped) counts.set(g.optionId, g._count._all);

  const totalVotes = grouped.reduce((acc, g) => acc + g._count._all, 0);

  const statusEmoji = pred.status === "OPEN" ? "🟢" : pred.status === "CLOSED" ? "🟡" : "🔴";

  const embed = new EmbedBuilder()
    .setTitle(`📊 Stats — ${pred.title}${tournamentName}`)
    .setDescription(
      [
        `${statusEmoji} **Estado:** ${pred.status}`,
        `🗳️ **Votos totales:** ${totalVotes}`,
        pred.game ? `🎮 **Juego:** ${pred.game}` : null,
        pred.lockTime ? `⏰ **Lock:** <t:${Math.floor(pred.lockTime.getTime() / 1000)}:F>` : null,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setColor("#cab0ec");

  for (const opt of pred.options) {
    const c = counts.get(opt.id) ?? 0;
    const pct = totalVotes > 0 ? Math.round((c / totalVotes) * 1000) / 10 : 0;

    embed.addFields({
      name: opt.label,
      value: `**${c}** votos (${pct}%)\n\`${opt.id}\``,
      inline: false,
    });
  }

  try {
    if (i.deferred) return await i.editReply({ embeds: [embed], content: "" });
    return await respond(i, "📊 Stats generadas."); // fallback raro
  } catch (e: any) {
    if (e?.code === 10062) {
      log.warn("pred/stats: respuesta falló con 10062", { ageMs: Date.now() - i.createdTimestamp });
      return;
    }
    throw e;
  }
}
