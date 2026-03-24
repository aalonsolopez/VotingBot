import { prisma } from "#db/prisma.js";
import type { PredictionModel } from "../generated/prisma/models/Prediction.js";
import type { PredictionOptionModel } from "../generated/prisma/models/PredictionOption.js";
import type { VoteModel } from "../generated/prisma/models/Vote.js";
import type { PredictionStatus } from "../generated/prisma/enums.js";
import { isTournamentActive, getById as getTournamentById } from "./tournament.js";

// Aliases for brevity
type Prediction = PredictionModel;
type PredictionOption = PredictionOptionModel;
type Vote = VoteModel;

export interface CreatePredictionInput {
  guildId: string;
  channelId: string;
  title: string;
  game: string | null;
  lockTime: Date | null;
  createdBy: string;
  tournamentId: string | null;
  options: string[]; // labels de las opciones
}

export interface VoteInput {
  predictionId: string;
  optionId: string;
  userId: string;
}

export interface ResolveInput {
  predictionId: string;
  winnerOptionId: string;
  resolvedBy: string;
}

export async function createPrediction(input: CreatePredictionInput): Promise<Prediction & { options: PredictionOption[] }> {
  const { guildId, channelId, title, game, lockTime, createdBy, tournamentId, options } = input;

  // Validar torneo si se proporciona
  if (tournamentId) {
    const isActive = await isTournamentActive(tournamentId);
    if (!isActive) {
      throw new Error("Tournament is not active");
    }
    // Verificar que el torneo pertenece al guild
    const tournament = await getTournamentById(tournamentId, guildId);
    if (!tournament) {
      throw new Error("Tournament not found in this guild");
    }
  }

  return prisma.prediction.create({
    data: {
      guildId,
      channelId,
      title,
      game: game ?? null,
      lockTime: lockTime ?? null,
      createdBy,
      tournamentId,
      options: {
        create: options.map((label) => ({ label })),
      },
    },
    include: { options: true },
  }) as any; // TODO: Type properly
}

export async function getPredictionById(predictionId: string): Promise<any> {
  return prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { options: true, votes: true },
  });
}

export async function getPredictionsByGuild(guildId: string, tournamentId?: string): Promise<any[]> {
  const where: any = { guildId };
  if (tournamentId) where.tournamentId = tournamentId;
  return prisma.prediction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { options: true },
  });
}

export async function getActivePredictions(guildId: string, tournamentId?: string): Promise<any[]> {
  const where: any = { guildId, status: "OPEN" };
  if (tournamentId) where.tournamentId = tournamentId;
  return prisma.prediction.findMany({
    where,
    orderBy: { lockTime: "asc" },
    include: { options: true },
  });
}

export async function votePrediction(input: VoteInput): Promise<any> {
  const { predictionId, optionId, userId } = input;

  // Verificar que la predicción existe y está abierta
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { options: true },
  });
  if (!prediction) throw new Error("Prediction not found");
  if (prediction.status !== "OPEN") throw new Error("Prediction is not open for voting");

  // Verificar que la opción pertenece a la predicción
  const option = prediction.options.find((o: any) => o.id === optionId);
  if (!option) throw new Error("Option does not belong to this prediction");

  // Upsert voto (1 voto por usuario por predicción)
  return prisma.vote.upsert({
    where: {
      predictionId_userId: { predictionId, userId },
    },
    update: { optionId },
    create: { predictionId, optionId, userId },
  });
}

export async function resolvePrediction(input: ResolveInput): Promise<{ totalVotes: number; correctCount: number }> {
  const { predictionId, winnerOptionId, resolvedBy } = input;

  // La lógica de puntos se manejará en tournamentPoints service
  // Aquí solo actualizamos el estado y creamos el resultado
  const result = await prisma
    .$transaction(async (tx) => {
      const existingResult = await tx.predictionResult.findUnique({
        where: { predictionId },
      });
      if (existingResult) {
        throw new Error("ALREADY_RESOLVED");
      }

      const prediction = await tx.prediction.findUnique({
        where: { id: predictionId },
        include: { options: true },
      });
      if (!prediction) throw new Error("Prediction not found");

      const votes = await tx.vote.findMany({
        where: { predictionId },
        select: { userId: true, optionId: true },
      });

      const totalVotes = votes.length;
      const correctUserIds = votes.filter((v) => v.optionId === winnerOptionId).map((v) => v.userId);

      await tx.prediction.update({
        where: { id: predictionId },
        data: { status: "RESOLVED" },
      });

      await tx.predictionResult.create({
        data: {
          predictionId,
          winnerOptionId,
          resolvedBy,
        },
      });

      // Actualizar puntos por torneo si hay tournamentId
      if (prediction.tournamentId) {
        const winnerOption = prediction.options.find((o: any) => o.id === winnerOptionId);
        const winnerLabel = winnerOption?.label ?? winnerOptionId;

        for (const userId of correctUserIds) {
          // Upsert TournamentPoints
          await tx.tournamentPoints.upsert({
            where: {
              tournamentId_userId: {
                tournamentId: prediction.tournamentId,
                userId,
              },
            },
            update: { total: { increment: 1 } },
            create: {
              tournamentId: prediction.tournamentId,
              userId,
              total: 1,
            },
          });

          // Crear entrada en PointsLedger
          await tx.pointsLedger.create({
            data: {
              guildId: prediction.guildId,
              tournamentId: prediction.tournamentId,
              userId,
              predictionId: prediction.id,
              delta: 1,
              reason: `Correct prediction (${winnerLabel})`,
            },
          });
        }
      }

      return {
        totalVotes,
        correctCount: correctUserIds.length,
        correctUserIds,
        tournamentId: prediction.tournamentId,
        guildId: prediction.guildId,
      };
    })
    .catch((e) => {
      if (e instanceof Error && e.message === "ALREADY_RESOLVED") return null;
      throw e;
    });

  if (result) {
    // Los puntos se actualizarán a través de tournamentPoints service
    return { totalVotes: result.totalVotes, correctCount: result.correctCount };
  }
  throw new Error("Already resolved");
}

export async function updatePredictionStatus(
  predictionId: string,
  status: PredictionStatus
): Promise<any> {
  return prisma.prediction.update({
    where: { id: predictionId },
    data: { status },
  });
}

export async function getPredictionsByTournament(tournamentId: string): Promise<any[]> {
  return prisma.prediction.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "desc" },
    include: { options: true },
  });
}

export async function getPredictionVotes(predictionId: string): Promise<any[]> {
  return prisma.vote.findMany({
    where: { predictionId },
    orderBy: { createdAt: "asc" },
  });
}