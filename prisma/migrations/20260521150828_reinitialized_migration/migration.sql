-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "RFIDTagStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOST', 'BLOCKED');

-- CreateEnum
CREATE TYPE "GateEventResult" AS ENUM ('VERIFIED', 'UNKNOWN_TAG', 'FACE_MISMATCH', 'PLATE_MISMATCH', 'DENIED', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "SnapshotType" AS ENUM ('FACE', 'PLATE', 'WIDE');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('PLATE_CAPTURED', 'FACE_CAPTURED', 'FACE_MATCHED', 'RFID_SCANNED', 'TAG_VALIDATED', 'BARRIER_OPENED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trucks" (
    "id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "assigned_driver_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trucks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rfid_tags" (
    "id" TEXT NOT NULL,
    "epc_id" TEXT NOT NULL,
    "status" "RFIDTagStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_truck_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rfid_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_verifications" (
    "id" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3) NOT NULL,
    "rfid_matched" BOOLEAN NOT NULL,
    "face_matched" BOOLEAN,
    "plate_matched" BOOLEAN,
    "face_confidence" DOUBLE PRECISION,
    "plate_confidence" DOUBLE PRECISION,
    "gate_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_events" (
    "id" TEXT NOT NULL,
    "event_code" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "result" "GateEventResult" NOT NULL,
    "plate_number_read" TEXT,
    "rfid_tag_id" TEXT,
    "truck_id" TEXT,
    "driver_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_snapshots" (
    "id" TEXT NOT NULL,
    "image_url" TEXT NOT NULL,
    "type" "SnapshotType" NOT NULL,
    "gate_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_timeline_events" (
    "id" TEXT NOT NULL,
    "type" "TimelineEventType" NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "gate_event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gate_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "trucks_plate_number_key" ON "trucks"("plate_number");

-- CreateIndex
CREATE UNIQUE INDEX "rfid_tags_epc_id_key" ON "rfid_tags"("epc_id");

-- CreateIndex
CREATE UNIQUE INDEX "rfid_tags_assigned_truck_id_key" ON "rfid_tags"("assigned_truck_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_verifications_gate_event_id_key" ON "event_verifications"("gate_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "gate_events_event_code_key" ON "gate_events"("event_code");

-- CreateIndex
CREATE INDEX "gate_events_event_code_idx" ON "gate_events"("event_code");

-- CreateIndex
CREATE INDEX "gate_events_occurred_at_idx" ON "gate_events"("occurred_at");

-- CreateIndex
CREATE INDEX "gate_events_result_idx" ON "gate_events"("result");

-- CreateIndex
CREATE INDEX "gate_events_truck_id_idx" ON "gate_events"("truck_id");

-- CreateIndex
CREATE INDEX "gate_events_driver_id_idx" ON "gate_events"("driver_id");

-- CreateIndex
CREATE INDEX "gate_events_rfid_tag_id_idx" ON "gate_events"("rfid_tag_id");

-- CreateIndex
CREATE INDEX "gate_events_plate_number_read_idx" ON "gate_events"("plate_number_read");

-- CreateIndex
CREATE INDEX "gate_timeline_events_gate_event_id_idx" ON "gate_timeline_events"("gate_event_id");

-- AddForeignKey
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rfid_tags" ADD CONSTRAINT "rfid_tags_assigned_truck_id_fkey" FOREIGN KEY ("assigned_truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_verifications" ADD CONSTRAINT "event_verifications_gate_event_id_fkey" FOREIGN KEY ("gate_event_id") REFERENCES "gate_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_rfid_tag_id_fkey" FOREIGN KEY ("rfid_tag_id") REFERENCES "rfid_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_truck_id_fkey" FOREIGN KEY ("truck_id") REFERENCES "trucks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_events" ADD CONSTRAINT "gate_events_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_snapshots" ADD CONSTRAINT "gate_snapshots_gate_event_id_fkey" FOREIGN KEY ("gate_event_id") REFERENCES "gate_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_timeline_events" ADD CONSTRAINT "gate_timeline_events_gate_event_id_fkey" FOREIGN KEY ("gate_event_id") REFERENCES "gate_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
