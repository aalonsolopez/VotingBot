import { prisma } from "#db/prisma.js";

export interface LeaderboardEntry {
  userId: string;
  total: number;
  rank: number;
}

export interface LeaderboardOptions {
  guildId: string;
  tournamentId?: string;
  limit?: number;
}

export async function getPointsLeaderboard(options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
  const { guildId, tournamentId, limit = 10 } = options;

  // Si se especifica tournamentId, filtrar por torneo
  // Si no, obtener todos los puntos de todos los torneos (global)
  const where: any = {};
  if (tournamentId) {
    where.tournamentId = tournamentId;
  } else {
    // Global: necesitamos agrupar por userId sumando totales de todos los torneos
    // Por simplicidad, por ahora solo mostramos leaderboard por torneo específico
    // El comando debe especificar tournamentId
    return [];
  }

  const top = await prisma.tournamentPoints.findMany({
    where,
    orderBy: [{ total: "desc" }, { userId: "asc" }],
    take: limit,
    select: { userId: true, total: true },
  });

  return top.map((entry, idx) => ({
    userId: entry.userId,
    total: entry.total,
    rank: idx + 1,
  }));
}

export async function getUserRank(
  userId: string,
  guildId: string,
  tournamentId?: string
): Promise<{ rank: number; total: number } | null> {
  if (!tournamentId) {
    // Ranking global no implementado por ahora
    return null;
  }
  
  // Ranking por torneo
  const points = await prisma.tournamentPoints.findUnique({
    where: {
      tournamentId_userId: { tournamentId, userId },
    },
    select: { total: true },
  });
  if (!points) return null;
  const total = points.total;

  const higher = await prisma.tournamentPoints.count({
    where: { tournamentId, total: { gt: total } },
  });
  return { rank: higher + 1, total };
}

export async function getParticipationLeaderboard(options: LeaderboardOptions): Promise<LeaderboardEntry[]> {
  const { guildId, tournamentId, limit = 10 } = options;

  const where: any = {
    prediction: { guildId },
  };
  if (tournamentId) {
    where.prediction = { ...where.prediction, tournamentId };
  }

  const rows = await prisma.vote.groupBy({
    by: ["userId"],
    where,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: limit,
  });

  return rows.map((row, idx) => ({
    userId: row.userId,
    total: row._count.id,
    rank: idx + 1,
  }));
}