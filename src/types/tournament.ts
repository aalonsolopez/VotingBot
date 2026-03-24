export { TournamentStatus } from '../generated/prisma/enums.js';
export type { TournamentModel as Tournament } from '../generated/prisma/models/Tournament.js';

/**
 * Tournament with relations included (for detailed queries)
 */
export type TournamentWithRelations = import('../generated/prisma/models/Tournament.js').TournamentModel & {
  predictions: any[];
  tournamentPoints: any[];
  pointsLedger: any[];
};