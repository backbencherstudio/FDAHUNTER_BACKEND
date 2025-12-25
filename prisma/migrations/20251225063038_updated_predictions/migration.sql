-- AlterEnum
ALTER TYPE "PredictionStatus" ADD VALUE 'OPEN';

-- AlterTable
ALTER TABLE "predictions" ALTER COLUMN "status" SET DEFAULT 'OPEN';
