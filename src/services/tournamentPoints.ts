import { prisma } from "#db/prisma.js";

export interface AwardPointsInput {
  tournamentId: string;
  userId: string;
  delta: number;
  reason: string;
  predictionId: string;
  guildId: string;
}

export async function awardPoints(input: AwardPointsInput): Promise<void> {
  const { tournamentId, userId, delta, reason, predictionId, guildId } = input;

  await prisma.$transaction(async (tx) => {
    // Actualizar o crear TournamentPoints
    await tx.tournamentPoints.upsert({
      where: {
        tournamentId_userId: { tournamentId, userId },
      },
      update: { total: { increment: delta } },
      create: { tournamentId, userId, total: delta },
    });

    // Registrar en PointsLedger
    await tx.pointsLedger.create({
      data: {
        guildId,
        tournamentId,
        userId,
        predictionId,
        delta,
        reason,
      },
    });
  });
}

export async function resetTournamentPoints(tournamentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.tournamentPoints.deleteMany({ where: { tournamentId } });
    await tx.pointsLedger.deleteMany({ where: { tournamentId } });
  });
}

export async function getUserTournamentPoints(
  tournamentId: string,
  userId: string
): Promise<number> {
  const points = await prisma.tournamentPoints.findUnique({
    where: { tournamentId_userId: { tournamentId, userId } },
    select: { total: true },
  });
  return points?.total ?? 0;
}

export async function getTotalTournamentPoints(tournamentId: string): Promise<number> {
  const result = await prisma.tournamentPoints.aggregate({
    where: { tournamentId },
    _sum: { total: true },
  });
  return result._sum.total ?? 0;
}

export async function getTournamentPointsLeaderboard(
  tournamentId: string,
  limit: number = 10
): Promise<{ userId: string; total: number }[]> {
  const points = await prisma.tournamentPoints.findMany({
    where: { tournamentId },
    orderBy: { total: "desc" },
    take: limit,
    select: { userId: true, total: true },
  });
  return points;
}

export async function rollbackPointsForPrediction(
  predictionId: string,
  tournamentId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Obtener todas las entradas de ledger para esta predicción
    const ledgerEntries = await tx.pointsLedger.findMany({
      where: { predictionId, tournamentId },
    });

    // Revertir cada delta
    for (const entry of ledgerEntries) {
      await tx.tournamentPoints.updateMany({
        where: { tournamentId, userId: entry.userId },
        data: { total: { decrement: entry.delta } },
      });
    }

    // Eliminar entradas del ledger
    await tx.pointsLedger.deleteMany({
      where: { predictionId, tournamentId },
    });
  });
}