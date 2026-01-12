import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";

export async function predStats(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return i.reply({ content: "Solo en servidores.", ephemeral: true });

  const predictionId = i.options.getString("id", true);

  await i.deferReply({ ephemeral: true });

  const pred = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { options: true },
  });

  if (!pred) {
    return i.editReply("❌ No existe esa predicción.");
  }

  const grouped = await prisma.vote.groupBy({
    by: ["optionId"],
    where: { predictionId: pred.id },
    _count: { _all: true },
  });

  const counts = new Map<string, number>();
  for (const g of grouped) counts.set(g.optionId, g._count._all);

  const totalVotes = grouped.reduce((acc, g) => acc + g._count._all, 0);

  const statusEmoji =
    pred.status === "OPEN" ? "🟢" : pred.status === "CLOSED" ? "🟡" : "🔴";

  const embed = new EmbedBuilder()
    .setTitle(`📊 Stats — ${pred.title}`)
    .setDescription(
      [
        `${statusEmoji} **Estado:** ${pred.status}`,
        `🗳️ **Votos totales:** ${totalVotes}`,
        pred.game ? `🎮 **Juego:** ${pred.game}` : null,
        pred.lockTime ? `⏰ **Lock:** <t:${Math.floor(pred.lockTime.getTime() / 1000)}:F>` : null,
      ].filter(Boolean).join("\n")
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

  return i.editReply({ embeds: [embed] });
}
