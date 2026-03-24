import type { ChatInputCommandInteraction } from "discord.js";
import { getPointsLeaderboard, getParticipationLeaderboard } from "../../../services/leaderboard.js";
import { getById as getTournamentById } from "../../../services/tournament.js";
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
 * /leaderboard [limit] [mode] [tournament]
 *
 * - mode (opcional): "points" (default) | "votes"
 * - limit (opcional): 1..25 (default 10)
 * - tournament (opcional): Tournament ID para filtrar
 *
 * Nota: main.ts ya hace deferReply(ephemeral) para comandos.
 */
export async function leaderboard(i: ChatInputCommandInteraction) {
  if (!i.inGuild()) return respond(i, "Solo en servidores.");

  const limitRaw = i.options.getInteger("top", false) ?? 10;
  const limit = clamp(limitRaw, 1, 28);
  const tournamentIdRaw = i.options.getString("tournament", false);
  const tournamentId = tournamentIdRaw ?? undefined;

  // Puedes registrar el option como "mode" o "type". Soporto ambos.
  const modeRaw =
    (i.options.getString("mode", false) ?? i.options.getString("type", false) ?? "points").toLowerCase();

  const guildId = i.guildId!;
  const requesterId = i.user.id;

  // Verificar que el torneo existe si se especifica
  let tournamentName = "";
  if (tournamentId) {
    try {
      const tournament = await getTournamentById(tournamentId, guildId);
      if (!tournament) {
        return respond(i, "❌ Torneo no encontrado en este servidor.");
      }
      tournamentName = ` - ${tournament.name}`;
    } catch (e) {
      log.error("leaderboard: error verificando torneo", e);
      return respond(i, "❌ Error al verificar el torneo.");
    }
  }

  try {
    if (modeRaw === "votes" || modeRaw === "participation") {
      // Leaderboard por participación (número de votos emitidos)
      const options: { guildId: string; tournamentId?: string; limit: number } = {
        guildId,
        limit,
      };
      if (tournamentId) options.tournamentId = tournamentId;
      const rows = await getParticipationLeaderboard(options);

      if (!rows.length) {
        return respond(i, "Aún no hay votos registrados para generar el leaderboard.");
      }

      const lines = rows.map((r, idx) => {
        const n = r.total;
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•";
        return `${medal} **${idx + 1}.** <@${r.userId}> — **${n}** voto${n === 1 ? "" : "s"}`;
      });

      const text = [`🏁 **Leaderboard de participación${tournamentName} (Top ${rows.length})**`, "", ...lines].join("\n");
      return respond(i, text);
    }

    // Default: leaderboard por puntos (TournamentPoints.total)
    const options2: { guildId: string; tournamentId?: string; limit: number } = {
      guildId,
      limit,
    };
    if (tournamentId) options2.tournamentId = tournamentId;
    const top = await getPointsLeaderboard(options2);

    if (!top.length) {
      return respond(i, "Aún no hay puntos registrados para generar el leaderboard.");
    }

    // Ranking del solicitante (best-effort) - necesitamos implementar getUserRank en el servicio
    // Por ahora, omitimos el ranking del solicitante
    let myRankLine: string | null = `👤 Tu puesto: sin puntos aún (participa en predicciones resueltas)`;

    const lines = top.map((r, idx) => {
      const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : "•";
      return `${medal} **${idx + 1}.** <@${r.userId}> — **${r.total}** punto${r.total === 1 ? "" : "s"}`;
    });

    const text = [`🏆 **Leaderboard de puntos${tournamentName} (Top ${top.length})**`, "", ...lines, "", myRankLine].join("\n");
    return respond(i, text);
  } catch (e) {
    log.error("leaderboard: error generando leaderboard", e);
    return respond(i, "❌ No pude generar el leaderboard. Revisa logs del bot (DB/Prisma).");
  }
}
