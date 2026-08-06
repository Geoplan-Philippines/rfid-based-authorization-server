import 'dotenv/config';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as bcrypt from 'bcrypt';
import { PrismaClient, RFIDTagStatus, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Production go-live seed.
 *
 * Loads the client's legacy RFID tag registry (CSV) plus the starting super-admin account.
 * The CSV is the source of truth: re-running re-asserts its tag-to-truck bindings, so manual
 * rebinds made through the UI after go-live will be reverted. Re-run only to repair a partial
 * import or to apply a revised CSV.
 *
 * Deliberately NOT seeded: drivers and truck-driver assignments. The legacy system had no driver
 * data, so there is nothing to import — staff add them through the UI once live.
 *
 * Usage:
 *   bun prisma/seed_production.ts [--dry-run] [--csv=<path>]
 */

const DEFAULT_CSV_PATH = resolve(__dirname, '..', 'docs', '20260622 RFID EPC ID.xlsx - Truck List new format.csv');

const EXPECTED_HEADER = 'Serial No. (Labelled on tag),EPC ID,Linked Truck Licence Number';

/** EPC-96 as written by the client's encoder: 24 uppercase hex characters. */
const EPC_PATTERN = /^[0-9A-F]{24}$/;

/** Keeps each createMany round trip well under Postgres' parameter limit. */
const INSERT_CHUNK_SIZE = 500;

/** 2002 tag rows in one interactive transaction needs far more than Prisma's 5s default. */
const TRANSACTION_OPTIONS = { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 };

const PASSWORD_SALT_ROUNDS = 10;

const superAdmin = {
  firstName: 'Admin',
  email: 'admin@eaglecement.com',
  password: 'EagleCement@2026',
  role: Role.SUPER_ADMIN,
};

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

let superAdminCreated = false;

const dryRun = process.argv.includes('--dry-run');
const csvPath = process.argv.find((arg) => arg.startsWith('--csv='))?.slice('--csv='.length) ?? DEFAULT_CSV_PATH;

class DryRunRollback extends Error {}

interface CsvRow {
  serialNo: string;
  epcId: string;
  /** Null when the legacy system had no truck linked to this tag. */
  plateNumber: string | null;
}

interface TagSeed {
  serialNo: string;
  epcId: string;
  /** Null for spare stock: the tag exists but is not issued to a truck. */
  plateNumber: string | null;
}

/**
 * Matches TrucksService.normalizePlateNumber so seeded plates are byte-identical to ones the API
 * would store. Nothing else is rewritten: registration and conduction numbers (CR#..., digits-only,
 * VINs) are kept exactly as the client recorded them.
 */
function normalizePlateNumber(value: string): string {
  return value.trim().toUpperCase();
}

function parseCsv(path: string): CsvRow[] {
  const contents = readFileSync(path, 'utf8');
  const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) throw new Error(`CSV is empty: ${path}`);

  const header = lines[0].trim();
  if (header !== EXPECTED_HEADER) {
    throw new Error(`Unexpected CSV header.\n  expected: ${EXPECTED_HEADER}\n  actual:   ${header}`);
  }

  return lines.slice(1).map((line, index) => {
    // Split on the first two commas only; anything after belongs to the plate column.
    const firstComma = line.indexOf(',');
    const secondComma = line.indexOf(',', firstComma + 1);

    if (firstComma === -1 || secondComma === -1) {
      throw new Error(`CSV line ${index + 2} has fewer than 3 columns: ${line}`);
    }

    const plateNumber = normalizePlateNumber(line.slice(secondComma + 1));

    return {
      serialNo: line.slice(0, firstComma).trim(),
      epcId: line.slice(firstComma + 1, secondComma).trim(),
      plateNumber: plateNumber === '' ? null : plateNumber,
    };
  });
}

/**
 * Fails fast on anything that would silently corrupt the registry, rather than importing it.
 */
function validateRows(rows: CsvRow[]): void {
  const errors: string[] = [];
  const seenSerials = new Map<string, string>();
  const seenEpcs = new Map<string, string>();

  for (const row of rows) {
    if (row.serialNo === '') errors.push(`EPC ${row.epcId}: missing serial number`);
    if (!EPC_PATTERN.test(row.epcId)) errors.push(`Serial ${row.serialNo}: malformed EPC ID "${row.epcId}"`);

    const duplicateSerialEpc = seenSerials.get(row.serialNo);
    if (duplicateSerialEpc) {
      errors.push(`Serial ${row.serialNo} appears twice (EPCs ${duplicateSerialEpc} and ${row.epcId})`);
    } else {
      seenSerials.set(row.serialNo, row.epcId);
    }

    const duplicateEpcSerial = seenEpcs.get(row.epcId);
    if (duplicateEpcSerial) {
      errors.push(`EPC ${row.epcId} appears twice (serials ${duplicateEpcSerial} and ${row.serialNo})`);
    } else {
      seenEpcs.set(row.epcId, row.serialNo);
    }
  }

  if (errors.length > 0) {
    throw new Error(`CSV validation failed with ${errors.length} problem(s):\n  - ${errors.join('\n  - ')}`);
  }
}

/**
 * A truck holds at most one tag, so when several tags claim the same plate the highest serial wins
 * (the later entry is the replacement tag). The superseded tags are still imported — as unbound
 * spare stock — so no row from the CSV is lost.
 */
function resolveTagSeeds(rows: CsvRow[]): { tagSeeds: TagSeed[]; supersededSerials: string[] } {
  const winningSerialByPlate = new Map<string, string>();

  for (const row of rows) {
    if (!row.plateNumber) continue;

    const currentWinner = winningSerialByPlate.get(row.plateNumber);
    if (currentWinner === undefined || Number(row.serialNo) > Number(currentWinner)) {
      winningSerialByPlate.set(row.plateNumber, row.serialNo);
    }
  }

  const supersededSerials: string[] = [];
  const tagSeeds = rows.map((row): TagSeed => {
    const isWinner = row.plateNumber !== null && winningSerialByPlate.get(row.plateNumber) === row.serialNo;
    if (row.plateNumber !== null && !isWinner) supersededSerials.push(row.serialNo);

    return {
      serialNo: row.serialNo,
      epcId: row.epcId,
      plateNumber: isWinner ? row.plateNumber : null,
    };
  });

  return { tagSeeds, supersededSerials };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));

  return chunks;
}

/**
 * An unbound tag must never be ACTIVE: the gate auto-opens on any matched + active tag without
 * checking that a truck is bound, so active spare stock would open the barrier attached to nothing.
 * Staff activate a tag through the status endpoint when they issue it to a truck.
 */
function resolveTagStatus(plateNumber: string | null): RFIDTagStatus {
  return plateNumber === null ? RFIDTagStatus.INACTIVE : RFIDTagStatus.ACTIVE;
}

async function main(): Promise<void> {
  const rows = parseCsv(csvPath);
  validateRows(rows);

  const { tagSeeds, supersededSerials } = resolveTagSeeds(rows);
  const plateNumbers = [...new Set(rows.flatMap((row) => (row.plateNumber ? [row.plateNumber] : [])))];
  const boundTagCount = tagSeeds.filter((tag) => tag.plateNumber !== null).length;

  console.log(`CSV:            ${csvPath}`);
  console.log(`Tags in CSV:    ${tagSeeds.length}`);
  console.log(`Unique trucks:  ${plateNumbers.length}`);
  console.log(`Bound tags:     ${boundTagCount}`);
  console.log(`Spare tags:     ${tagSeeds.length - boundTagCount} (seeded INACTIVE)`);
  if (supersededSerials.length > 0) {
    console.log(`Superseded:     serial(s) ${supersededSerials.join(', ')} — duplicate plate, kept as spare stock`);
  }
  console.log('');

  try {
    await prisma.$transaction(async (tx) => {
      const passwordHash = await bcrypt.hash(superAdmin.password, PASSWORD_SALT_ROUNDS);

      const existingSuperAdmin = await tx.user.findUnique({
        where: { email: superAdmin.email },
        select: { id: true },
      });

      await tx.user.upsert({
        where: { email: superAdmin.email },
        create: {
          firstName: superAdmin.firstName,
          email: superAdmin.email,
          password: passwordHash,
          role: superAdmin.role,
        },
        // Never silently reset a live account's password; only guarantee it can still administer.
        update: { role: superAdmin.role, isArchived: false },
      });

      superAdminCreated = existingSuperAdmin === null;
      if (superAdminCreated) {
        console.log(`Super admin:    ${superAdmin.email} created`);
      } else {
        // seed_demo.ts claims this same address. Re-running this seed is harmless, but landing on a
        // demo account means the documented password is not the one that works.
        console.log(`Super admin:    ${superAdmin.email} already existed — password left unchanged.`);
        console.log(`                If this seed did not create it (seed_demo.ts uses the same address),`);
        console.log(`                "${superAdmin.password}" will NOT sign in. Prefer a clean database.`);
      }

      for (const batch of chunk(plateNumbers, INSERT_CHUNK_SIZE)) {
        await tx.truck.createMany({
          // model stays null: the legacy system recorded no truck models.
          data: batch.map((plateNumber) => ({ plateNumber })),
          skipDuplicates: true,
        });
      }

      const trucks = await tx.truck.findMany({
        where: { plateNumber: { in: plateNumbers } },
        select: { id: true, plateNumber: true },
      });
      const truckIdByPlate = new Map(trucks.map((truck) => [truck.plateNumber, truck.id]));

      const missingTrucks = plateNumbers.filter((plateNumber) => !truckIdByPlate.has(plateNumber));
      if (missingTrucks.length > 0) {
        throw new Error(`Trucks missing after insert: ${missingTrucks.join(', ')}`);
      }
      console.log(`Trucks:         ${trucks.length} present (${plateNumbers.length} from CSV)`);

      const desiredTruckIdByEpc = new Map(
        tagSeeds.map((tag) => [tag.epcId, tag.plateNumber ? (truckIdByPlate.get(tag.plateNumber) ?? null) : null]),
      );
      const targetTruckIds = [...desiredTruckIdByEpc.values()].filter((id): id is string => id !== null);

      // Release any binding that blocks a CSV binding — a tag holding a target truck that the CSV
      // assigns elsewhere. Without this, re-running after a manual rebind hits the unique
      // constraint on assigned_truck_id.
      const blockingTags = await tx.rFIDTag.findMany({
        where: { assignedTruckId: { in: targetTruckIds } },
        select: { id: true, epcId: true, assignedTruckId: true },
      });
      const staleTagIds = blockingTags
        .filter((tag) => desiredTruckIdByEpc.get(tag.epcId) !== tag.assignedTruckId)
        .map((tag) => tag.id);

      if (staleTagIds.length > 0) {
        await tx.rFIDTag.updateMany({ where: { id: { in: staleTagIds } }, data: { assignedTruckId: null } });
        console.log(`Released:       ${staleTagIds.length} conflicting tag binding(s) before re-asserting the CSV`);
      }

      for (const batch of chunk(tagSeeds, INSERT_CHUNK_SIZE)) {
        await tx.rFIDTag.createMany({
          data: batch.map((tag) => ({
            epcId: tag.epcId,
            serialNo: tag.serialNo,
            status: resolveTagStatus(tag.plateNumber),
            assignedTruckId: tag.plateNumber ? truckIdByPlate.get(tag.plateNumber) : null,
          })),
          skipDuplicates: true,
        });
      }

      // Bring rows that already existed (a partial earlier run, or UI-created tags) back in line
      // with the CSV. On a clean database this finds nothing to do.
      const existingTags = await tx.rFIDTag.findMany({
        where: { epcId: { in: tagSeeds.map((tag) => tag.epcId) } },
        select: { id: true, epcId: true, serialNo: true, status: true, assignedTruckId: true },
      });
      const tagSeedByEpc = new Map(tagSeeds.map((tag) => [tag.epcId, tag]));

      let realignedCount = 0;
      for (const existingTag of existingTags) {
        const seed = tagSeedByEpc.get(existingTag.epcId);
        if (!seed) continue;

        const desiredTruckId = seed.plateNumber ? (truckIdByPlate.get(seed.plateNumber) ?? null) : null;
        const desiredStatus = resolveTagStatus(seed.plateNumber);
        const isAligned =
          existingTag.serialNo === seed.serialNo &&
          existingTag.status === desiredStatus &&
          existingTag.assignedTruckId === desiredTruckId;

        if (isAligned) continue;

        await tx.rFIDTag.update({
          where: { id: existingTag.id },
          data: { serialNo: seed.serialNo, status: desiredStatus, assignedTruckId: desiredTruckId },
        });
        realignedCount += 1;
      }

      const alignedCount = existingTags.length - realignedCount;
      console.log(`RFID tags:      ${existingTags.length} present (${realignedCount} realigned to CSV, ${alignedCount} newly created or already matching)`);

      if (existingTags.length !== tagSeeds.length) {
        throw new Error(`Expected ${tagSeeds.length} tags after import but found ${existingTags.length}`);
      }

      if (dryRun) throw new DryRunRollback();
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log('\nDry run succeeded; rolled back all production seed changes.');
      return;
    }

    throw error;
  }

  console.log('\nProduction seed complete.');
  if (superAdminCreated) {
    console.log(`Sign in as ${superAdmin.email} / ${superAdmin.password} and archive this account once a real super admin exists.`);
  } else {
    console.log(`Sign in as ${superAdmin.email} using its existing password, and archive it once a real super admin exists.`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
