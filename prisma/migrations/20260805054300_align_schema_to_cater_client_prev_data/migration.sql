/*
  Warnings:

  - A unique constraint covering the columns `[serial_no]` on the table `rfid_tags` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "rfid_tags" DROP CONSTRAINT "rfid_tags_assigned_truck_id_fkey";

-- AlterTable
ALTER TABLE "rfid_tags" ADD COLUMN     "serial_no" TEXT,
ALTER COLUMN "assigned_truck_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "trucks" ALTER COLUMN "model" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "rfid_tags_serial_no_key" ON "rfid_tags"("serial_no");

-- AddForeignKey
ALTER TABLE "rfid_tags" ADD CONSTRAINT "rfid_tags_assigned_truck_id_fkey" FOREIGN KEY ("assigned_truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
