import type { ChatInputCommandInteraction } from "discord.js";
import { prisma } from "../../../db/prisma.js";
import { log } from "../../../log.js";

async function respond(i: ChatInputCommandInteraction, content: string) {
  // 64 = MessageFlags.Ephemeral
  if (i.deferred) return i.editReply({ content });
  if (i.replied) return i.followUp({ content, flags: 64 });
  return i.reply({ content, flags: 64 });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * /leaderboard [limit] [mode]
 *
 * - mode (opcional): "points" (default) | "votes"
 * - limit (opcional): 1..25 (default 10)
 *
 * Nota: main.ts ya hace deferReply(ephemeral) para comandos.
 */
export async function leaderboard(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  const limitRaw = i.options.getInteger("limit", false) ?? 10;
  const limit = clamp(limitRaw, 1, 25);

  // Puedes registrar el option como "mode" o "type". Soporto ambos.
  const modeRaw =
    (i.options.getString("mode", false) ?? i.options.getString("type", false) ?? "points").toLowerCase();

  const guildId = i.guildId!;
  const requesterId = i.user.id;

  try {
    if (modeRaw === "votes" || modeRaw === "participation") {
      // Leaderboard por participación (número de votos emitidos)
      const rows = await prisma.vote.groupBy({
        by: ["userId"],
        where: {
          prediction: { guildId },
        },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: limit,
      });

      if (!rows.length) {
        return respond(i, "Aún no hay votos registrados para generar el leaderboard.");
      }

      const lines = rows.map((r, idx) => {
        const n = r._count.id;
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•";
        return `${medal} **${idx + 1}.** <@${r.userId}> — **${n}** voto${n === 1 ? "" : "s"}`;
      });

      const text = [`🏁 **Leaderboard de participación (Top ${rows.length})**`, "", ...lines].join("\n");
      return respond(i, text);
    }

    // Default: leaderboard por puntos (UserPoints.total)
    const top = await prisma.userPoints.findMany({
      where: { guildId },
      orderBy: [{ total: "desc" }, { userId: "asc" }],
      take: limit,
    });

    if (!top.length) {
      return respond(i, "Aún no hay puntos registrados para generar el leaderboard.");
    }

    // Ranking del solicitante (best-effort)
    const me = await prisma.userPoints.findUnique({
      where: { guildId_userId: { guildId, userId: requesterId } },
      select: { total: true },
    });

    let myRankLine: string | null = null;
    if (me) {
      const higher = await prisma.userPoints.count({
        where: { guildId, total: { gt: me.total } },
      });
      const myRank = higher + 1;
      myRankLine = `👤 Tu puesto: **#${myRank}** con **${me.total}** punto${me.total === 1 ? "" : "s"}`;
    } else {
      myRankLine = `👤 Tu puesto: sin puntos aún (participa en predicciones resueltas)`;
    }

    const lines = top.map((r, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•";
      return `${medal} **${idx + 1}.** <@${r.userId}> — **${r.total}** punto${r.total === 1 ? "" : "s"}`;
    });

    const text = [`🏆 **Leaderboard de puntos (Top ${top.length})**`, "", ...lines, "", myRankLine].join("\n");
    return respond(i, text);
  } catch (e) {
    log.error("leaderboard: error generando leaderboard", e);
    return respond(i, "❌ No pude generar el leaderboard. Revisa logs del bot (DB/Prisma).");
  }
}
