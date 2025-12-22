import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";

export async function predLeaderboard(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return i.reply({ content: "Solo en servidores.", ephemeral: true });

  await i.deferReply({ ephemeral: false }); // leaderboard suele ser útil público

  const rows = await prisma.userPoints.findMany({
    where: { guildId: i.guildId! },
    orderBy: [{ total: "desc" }, { userId: "asc" }],
    take: 20,
  });

  if (rows.length === 0) {
    return i.editReply("Todavía no hay puntuaciones en este servidor.");
  }

  const lines = rows.map((r, idx) => `${idx + 1}. <@${r.userId}> — **${r.total}** pts`);

  const embed = new EmbedBuilder()
    .setTitle("🏆 Leaderboard (Top 20)")
    .setDescription(lines.join("\n"));

  return i.editReply({ embeds: [embed] });
}
