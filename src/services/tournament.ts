import { prisma } from "#db/prisma.js";
import type { TournamentStatus } from "../generated/prisma/enums.js";
import type { Tournament } from "../types/tournament.js";

export interface CreateTournamentInput {
  name: string;
  guildId: string;
  creatorId: string;
  startDate?: Date | null;
  endDate?: Date | null;
}

export interface TournamentFilters {
  guildId?: string;
  status?: TournamentStatus;
  creatorId?: string;
}

export async function createTournament(input: CreateTournamentInput): Promise<Tournament> {
  const { name, guildId, creatorId, startDate, endDate } = input;
  return prisma.tournament.create({
    data: {
      name,
      guildId,
      creatorId,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      status: "ACTIVE",
    },
  });
}

export async function deactivateTournament(tournamentId: string, guildId: string): Promise<Tournament | null> {
  // Verifica que el torneo pertenece al guild antes de desactivar
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, guildId },
  });
  if (!tournament) return null;

  return prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "INACTIVE" },
  });
}

export async function activateTournament(tournamentId: string, guildId: string): Promise<Tournament | null> {
  const tournament = await prisma.tournament.findFirst({
    where: { id: tournamentId, guildId },
  });
  if (!tournament) return null;

  return prisma.tournament.update({
    where: { id: tournamentId },
    data: { status: "ACTIVE" },
  });
}

export async function getByGuild(guildId: string, filters?: TournamentFilters): Promise<Tournament[]> {
  const where: any = { guildId };
  if (filters?.status) where.status = filters.status;
  if (filters?.creatorId) where.creatorId = filters.creatorId;

  return prisma.tournament.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

export async function getById(tournamentId: string, guildId?: string): Promise<Tournament | null> {
  const where: any = { id: tournamentId };
  if (guildId) where.guildId = guildId;

  return prisma.tournament.findFirst({
    where,
  });
}

export async function getActiveTournamentForGuild(guildId: string): Promise<Tournament | null> {
  return prisma.tournament.findFirst({
    where: { guildId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

export async function isTournamentActive(tournamentId: string): Promise<boolean> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { status: true },
  });
  return tournament?.status === "ACTIVE";
}

export async function validateTournamentAccess(
  tournamentId: string,
  guildId: string,
  userId: string,
  userPermissions: { isAdmin: boolean; isMod: boolean }
): Promise<{ valid: boolean; tournament: Tournament | null; error?: string }> {
  const tournament = await getById(tournamentId, guildId);
  if (!tournament) {
    return { valid: false, tournament: null, error: "Tournament not found in this guild" };
  }

  // Solo el creador o usuarios con permisos de administrador/mod pueden modificar
  if (tournament.creatorId !== userId && !userPermissions.isAdmin && !userPermissions.isMod) {
    return { valid: false, tournament, error: "You don't have permission to modify this tournament" };
  }

  return { valid: true, tournament };
}