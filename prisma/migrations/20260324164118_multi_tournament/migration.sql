-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "status" "TournamentStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "creatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TournamentPoints" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TournamentPoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tournament_guildId_status_idx" ON "Tournament"("guildId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentPoints_tournamentId_userId_key" ON "TournamentPoints"("tournamentId", "userId");

-- CreateIndex
CREATE INDEX "TournamentPoints_tournamentId_total_idx" ON "TournamentPoints"("tournamentId", "total");

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentPoints" ADD CONSTRAINT "TournamentPoints_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Add tournamentId to PointsLedger
ALTER TABLE "PointsLedger" ADD COLUMN "tournamentId" TEXT;

-- CreateIndex for PointsLedger
CREATE INDEX "PointsLedger_tournamentId_idx" ON "PointsLedger"("tournamentId");
CREATE INDEX "PointsLedger_predictionId_idx" ON "PointsLedger"("predictionId");

-- AddForeignKey for PointsLedger
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable: UserPoints (reset points)
DROP TABLE "UserPoints";