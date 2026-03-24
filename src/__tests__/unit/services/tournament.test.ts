import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '#db/prisma.js';
import type { TournamentStatus } from '../../../generated/prisma/enums.js';

// Mock de los métodos de Prisma que usaremos
vi.mock('#db/prisma.js', () => ({
  prisma: {
    tournament: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Importar el servicio después de mockear
import { 
  createTournament, 
  deactivateTournament,
  isTournamentActive,
  validateTournamentAccess
} from '../../../services/tournament.js';

describe('Tournament Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTournament', () => {
    it('should create a tournament with correct data', async () => {
      const input = {
        name: 'Test Tournament',
        guildId: 'guild-123',
        creatorId: 'user-123',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      };

      const expectedTournament = {
        id: 'tournament-123',
        ...input,
        status: 'ACTIVE' as TournamentStatus,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(prisma.tournament.create).mockResolvedValue(expectedTournament);

      const result = await createTournament(input);

      expect(prisma.tournament.create).toHaveBeenCalledWith({
        data: {
          name: input.name,
          guildId: input.guildId,
          creatorId: input.creatorId,
          startDate: input.startDate,
          endDate: input.endDate,
          status: 'ACTIVE',
        },
      });

      expect(result).toEqual(expectedTournament);
    });
  });

  describe('isTournamentActive', () => {
    it('should return true if tournament status is ACTIVE', async () => {
      const tournamentId = 'tournament-123';
      
      vi.mocked(prisma.tournament.findUnique).mockResolvedValue({
        id: tournamentId,
        status: 'ACTIVE',
      } as any);

      const result = await isTournamentActive(tournamentId);

      expect(prisma.tournament.findUnique).toHaveBeenCalledWith({
        where: { id: tournamentId },
        select: { status: true },
      });

      expect(result).toBe(true);
    });

    it('should return false if tournament not found', async () => {
      const tournamentId = 'tournament-123';
      
      vi.mocked(prisma.tournament.findUnique).mockResolvedValue(null);

      const result = await isTournamentActive(tournamentId);

      expect(result).toBe(false);
    });
  });
});