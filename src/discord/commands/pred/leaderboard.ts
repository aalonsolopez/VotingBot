import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { prisma } from "#db/prisma.js";

export async function predLeaderboard(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return i.reply({ content: "Solo en servidores.", ephemeral: true });

  let topNumber: number | null = 20;

  await i.deferReply({ ephemeral: false }); // leaderboard suele ser útil público
  let lines: string[] = [];

  if (i.options.getUser("user")) {
    const user = i.options.getUser("user", true);
    const entry = await prisma.userPoints.findUnique({
      where: { guildId_userId: { guildId: i.guildId!, userId: user.id } },
    });

    if (!entry) {
      return i.editReply({ content: `❌ <@${user.id}> no tiene puntuaciones en este servidor.` });
    }

    const ordered = await prisma.userPoints.findMany({
      where: { guildId: i.guildId! },
      orderBy: [{ total: "desc" }, { userId: "asc" }],
      select: { userId: true },
    });

    const idx = ordered.findIndex(r => r.userId === user.id);
    const rank = idx >= 0 ? idx + 1 : null;
    topNumber = null;

    lines = [
      `👤 Usuario: <@${user.id}>`,
      `🏅 Posición: ${rank ?? "(no disponible)"}`,
      `⭐ Puntos: **${entry.total}**`,
    ];
  } else if (i.options.getBoolean("total")) {
    // Mostrar todos los participantes del servidor con sus puntos totales
    const rows = await prisma.userPoints.findMany({
      where: { guildId: i.guildId! },
      orderBy: [{ total: "desc" }, { userId: "asc" }],
    });

    if (rows.length === 0) {
      return i.editReply({ content: "Todavía no hay puntuaciones en este servidor." });
    }
    
    lines = rows.map((r, idx) => `${idx + 1}. <@${r.userId}> — **${r.total}** pts`);
    topNumber = rows.length;

  } else if (i.options.getInteger("top")) {
    const topN = i.options.getInteger("top", true);
    const rows = await prisma.userPoints.findMany({
      where: { guildId: i.guildId! },
      orderBy: [{ total: "desc" }, { userId: "asc" }],
      take: topN,
    });
    if (rows.length === 0) {
      return i.editReply({ content: "Todavía no hay puntuaciones en este servidor." });
    }

    lines = rows.map((r, idx) => `${idx + 1}. <@${r.userId}> — **${r.total}** pts`);
    topNumber = topN;
  } else {
    const rows = await prisma.userPoints.findMany({
      where: { guildId: i.guildId! },
      orderBy: [{ total: "desc" }, { userId: "asc" }],
      take: 20,
    });

    if (rows.length === 0) {
      return i.editReply("Todavía no hay puntuaciones en este servidor.");
    }

    lines = rows.map((r, idx) => `${idx + 1}. <@${r.userId}> — **${r.total}** pts`);
  }

  const embed = new EmbedBuilder()
    .setTitle(topNumber ? `🏆 Leaderboard (Top ${topNumber})` : "🏆 Leaderboard")
    .setDescription(lines.join("\n"));

  return i.editReply({ embeds: [embed] });
}
