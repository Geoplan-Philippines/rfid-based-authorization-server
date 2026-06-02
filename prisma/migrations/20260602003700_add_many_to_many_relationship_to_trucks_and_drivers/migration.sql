/*
  Warnings:

  - You are about to drop the column `assigned_driver_id` on the `trucks` table. All the data in the column will be lost.
  - Made the column `assigned_truck_id` on table `rfid_tags` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TruckDriverAssignmentStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'OPERATOR';

-- DropForeignKey
ALTER TABLE "rfid_tags" DROP CONSTRAINT "rfid_tags_assigned_truck_id_fkey";

-- DropForeignKey
ALTER TABLE "trucks" DROP CONSTRAINT "trucks_assigned_driver_id_fkey";

-- AlterTable
ALTER TABLE "rfid_tags" ALTER COLUMN "assigned_truck_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "trucks" DROP COLUMN "assigned_driver_id";

-- CreateTable
CREATE TABLE "truck_driver_assignments" (
    "status" "TruckDriverAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "truck_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "truck_driver_assignments_pkey" PRIMARY KEY ("truck_id","driver_id")
);

-- CreateIndex
CREATE INDEX "truck_driver_assignments_driver_id_idx" ON "truck_driver_assignments"("driver_id");

-- AddForeignKey
ALTER TABLE "truck_driver_assignments" ADD CONSTRAINT "truck_driver_assignments_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "truck_driver_assignments" ADD CONSTRAINT "truck_driver_assignments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_tags" ADD CONSTRAINT "rfid_tags_assigned_truck_id_fkey" FOREIGN KEY ("assigned_truck_id") REFERENCES "trucks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
