/*
  Warnings:

  - A unique constraint covering the columns `[first_name,last_name]` on the table `drivers` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "drivers_first_name_last_name_key" ON "drivers"("first_name", "last_name");
