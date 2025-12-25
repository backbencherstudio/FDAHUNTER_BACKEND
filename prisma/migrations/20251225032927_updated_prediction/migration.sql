-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('WIN', 'CANCEL', 'LOSS');

-- CreateTable
CREATE TABLE "predictions" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),
    "userid" TEXT,
    "category_id" TEXT,
    "notes" TEXT,
    "win_percent" DOUBLE PRECISION,
    "status" "PredictionStatus" DEFAULT 'CANCEL',

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
