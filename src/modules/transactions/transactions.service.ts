import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GateEventResult, Prisma, RFIDTagStatus, SnapshotType, TimelineEventType } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { EmailService } from '../email/email.service';
import { env } from 'src/core/config/env.config';
import { GetAllTransactionsQueryDTO } from './dto/get-all-transactions-query.dto';
import { RecordRfidReadDTO } from './dto/record-rfid-read.dto';
import { RecordPlateReadDTO } from './dto/record-plate-read.dto';
import { RecordFaceReadDTO } from './dto/record-face-read.dto';
import { RecordBarrierEventDTO } from './dto/record-barrier-event.dto';
import { AuthenticatedUser } from '../auth/types/auth.types';
import { OpenTransaction, TransactionDetail, TransactionListResponse, TransactionResultCounts, openTransactionInclude, transactionDetailInclude, transactionListInclude } from './types/transactions.types';
import { toTransactionDetail, toTransactionListItem } from './transactions.mapper';
import { TERMINAL_RESULTS } from './transactions.policy';

// --- Hardcoded fallbacks ----------------------------------------------------
// Used only when a device/service omits an optional field (e.g. manual testing). Real devices
// will always supply confidence + snapshot URLs.
const HARDCODED_PLATE_CONFIDENCE = 0.96; // TODO: always provided by the OCR service
const HARDCODED_FACE_CONFIDENCE = 0.88; // TODO: always provided by the face-recognition service
const PLACEHOLDER_SNAPSHOT_URL = 'https://placeholder.local/snapshot.jpg'; // TODO: real capture storage

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async getAllTransactions(query: GetAllTransactionsQueryDTO): Promise<TransactionListResponse> {
    const { page, limit } = query;
    const where = this.buildListWhere(query);
    const countsWhere = this.buildListWhere(query, { includeResult: false });

    const [events, total, counts] = await Promise.all([
      this.prisma.gateEvent.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { occurredAt: 'desc' },
        include: transactionListInclude,
      }),
      this.prisma.gateEvent.count({ where }),
      this.getResultCounts(countsWhere),
    ]);

    return {
      data: events.map((event) => toTransactionListItem(event)),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        counts,
      },
    };
  }

  async getTransactionById(id: string): Promise<TransactionDetail> {
    const event = await this.prisma.gateEvent.findUnique({
      where: { id },
      include: transactionDetailInclude,
    });

    if (!event) throw new NotFoundException('Transaction not found');

    return toTransactionDetail(event);
  }

  // Stage 1 — RFID reader reports a tag read. Opens a new transaction and validates the tag.
  async recordRfidRead(body: RecordRfidReadDTO): Promise<TransactionDetail> {
    const tag = await this.prisma.rFIDTag.findUnique({
      where: { epcId: body.epcId },
      include: { assignedTruck: true },
    });

    const truck = tag?.assignedTruck ?? null;
    const rfidMatched = tag !== null;
    const tagActive = tag?.status === RFIDTagStatus.ACTIVE;
    const canVerify = truck !== null && tagActive;

    // No plate/face yet: the result is provisional and recomputed as later stages report in.
    const result = this.resolveGateEventResult({ rfidMatched, tagActive, plateMatched: null, faceMatched: null });
    const occurredAt = new Date();

    const event = await this.prisma.gateEvent.create({
      data: {
        eventCode: await this.generateEventCode(occurredAt),
        occurredAt,
        result,
        rfidTag: tag ? { connect: { id: tag.id } } : undefined,
        truck: truck ? { connect: { id: truck.id } } : undefined,
        // Driver identity comes from the face stage; left empty until then.
        verification: { create: { verifiedAt: occurredAt, rfidMatched } },
        timeline: {
          create: [
            { type: TimelineEventType.RFID_SCANNED, message: `EPC ${body.epcId}`, occurredAt },
            ...(canVerify
              ? [{ type: TimelineEventType.TAG_VALIDATED, message: `bound to ${truck.plateNumber}`, occurredAt: this.after(occurredAt, 1) }]
              : []),
          ],
        },
      },
      include: transactionDetailInclude,
    });

    return toTransactionDetail(event);
  }

  // Stage 2 — plate-recognition service reports the read plate. Patches the latest open transaction.
  async recordPlateRead(body: RecordPlateReadDTO): Promise<TransactionDetail> {
    const event = await this.findOpenTransaction();
    // Idempotency: the plate stage runs once. A retry (already-stamped verification) is rejected
    // rather than appending duplicate timeline rows + snapshots.
    if (event.verification && event.verification.plateMatched !== null) {
      throw new ConflictException('Plate read already recorded for this transaction');
    }

    const truckPlate = event.truck!.plateNumber;
    const plateMatched = body.plateNumberRead === truckPlate;

    const now = new Date();
    const result = this.resolveGateEventResult({
      rfidMatched: true,
      tagActive: true,
      plateMatched,
      faceMatched: event.verification?.faceMatched ?? null,
    });

    await this.prisma.$transaction([
      this.prisma.gateEvent.update({
        where: { id: event.id },
        data: { plateNumberRead: body.plateNumberRead, result },
      }),
      this.prisma.eventVerification.update({
        where: { gateEventId: event.id },
        data: { plateMatched, plateConfidence: body.plateConfidence ?? HARDCODED_PLATE_CONFIDENCE },
      }),
      this.prisma.gateTimelineEvent.create({
        data: { gateEventId: event.id, type: TimelineEventType.PLATE_CAPTURED, message: body.plateNumberRead, occurredAt: now },
      }),
      ...(plateMatched
        ? [
            this.prisma.gateTimelineEvent.create({
              data: { gateEventId: event.id, type: TimelineEventType.PLATE_MATCHED, message: 'matches bound truck', occurredAt: this.after(now, 1) },
            }),
          ]
        : []),
      this.prisma.gateSnapshot.create({
        data: { gateEventId: event.id, type: SnapshotType.PLATE, imageUrl: body.snapshotUrl ?? PLACEHOLDER_SNAPSHOT_URL },
      }),
      // Same CCTV frame, full-truck view. TODO: real capture storage will supply both URLs.
      this.prisma.gateSnapshot.create({
        data: { gateEventId: event.id, type: SnapshotType.WIDE, imageUrl: body.wideSnapshotUrl ?? PLACEHOLDER_SNAPSHOT_URL },
      }),
    ]);

    return this.getTransactionById(event.id);
  }

  // Stage 3 — face-recognition service reports the identified driver. Patches the latest open
  // transaction. The backend computes the match against the truck's assigned driver.
  async recordFaceRead(body: RecordFaceReadDTO): Promise<TransactionDetail> {
    const event = await this.findOpenTransaction();
    // Idempotency: the face stage runs once. A retry (already-stamped verification) is rejected
    // rather than appending duplicate timeline rows + snapshots.
    if (event.verification && event.verification.faceMatched !== null) {
      throw new ConflictException('Face read already recorded for this transaction');
    }

    const assignedDriverId = event.truck!.driverAssignments[0]?.driverId ?? null;

    if (body.driverId) {
      const driver = await this.prisma.driver.findUnique({ where: { id: body.driverId } });
      if (!driver) throw new BadRequestException('Recognised driver does not exist');
    }

    // Match = the recognised driver is the one assigned to this truck. An unrecognised face
    // (no driverId) is a non-match.
    const faceMatched = body.driverId !== undefined && body.driverId === assignedDriverId;

    const now = new Date();
    const result = this.resolveGateEventResult({
      rfidMatched: true,
      tagActive: true,
      plateMatched: event.verification?.plateMatched ?? null,
      faceMatched,
    });

    await this.prisma.$transaction([
      this.prisma.gateEvent.update({
        where: { id: event.id },
        data: { result, driver: body.driverId ? { connect: { id: body.driverId } } : undefined },
      }),
      this.prisma.eventVerification.update({
        where: { gateEventId: event.id },
        data: { faceMatched, faceConfidence: body.faceConfidence ?? HARDCODED_FACE_CONFIDENCE },
      }),
      this.prisma.gateTimelineEvent.create({
        data: { gateEventId: event.id, type: TimelineEventType.FACE_CAPTURED, message: 'snapshot stored', occurredAt: now },
      }),
      ...(faceMatched
        ? [
            this.prisma.gateTimelineEvent.create({
              data: { gateEventId: event.id, type: TimelineEventType.FACE_MATCHED, message: 'matches assigned driver', occurredAt: this.after(now, 1) },
            }),
          ]
        : []),
      this.prisma.gateSnapshot.create({
        data: { gateEventId: event.id, type: SnapshotType.FACE, imageUrl: body.snapshotUrl ?? PLACEHOLDER_SNAPSHOT_URL },
      }),
    ]);

    return this.getTransactionById(event.id);
  }

  // Stage 4 — barrier open. The final step: closes the transaction. Triggered from the operator
  // console; in production the RFID controller also opens the boom locally (GPIO) on a valid tag.
  // RFID-only policy: a valid, active tag opens regardless of plate/face mismatches. Opening a
  // flagged (non-VERIFIED) transaction is a manual override — it forces the result to MANUAL_OVERRIDE
  // and records the acting operator + reason; opening a VERIFIED one is a normal close.
  async recordBarrierOpened(operator: AuthenticatedUser, body: RecordBarrierEventDTO): Promise<TransactionDetail> {
    const event = await this.findOpenTransaction();
    const now = new Date();
    const isOverride = event.result !== GateEventResult.VERIFIED;

    await this.prisma.$transaction([
      // Override branch: flip the result and log who/why before the barrier opens.
      ...(isOverride
        ? [
            this.prisma.gateEvent.update({
              where: { id: event.id },
              data: { result: GateEventResult.MANUAL_OVERRIDE },
            }),
            // Operator identity lives in metadata since the schema has no dedicated override-by column.
            this.prisma.gateTimelineEvent.create({
              data: {
                gateEventId: event.id,
                type: TimelineEventType.MANUAL_OVERRIDE,
                message: body.reason ?? 'manual override',
                metadata: { operatorId: operator.id, operatorEmail: operator.email },
                occurredAt: now,
              },
            }),
          ]
        : []),
      this.prisma.gateTimelineEvent.create({
        data: {
          gateEventId: event.id,
          type: TimelineEventType.BARRIER_OPENED,
          message: isOverride ? 'manual override' : 'RFID-only policy',
          occurredAt: isOverride ? this.after(now, 1) : now,
        },
      }),
      this.prisma.eventVerification.update({ where: { gateEventId: event.id }, data: { verifiedAt: now } }),
    ]);

    // The transaction is now complete (barrier opened). Alert reviewers if it closed on a
    // non-VERIFIED result — the email then reflects the final state, including any override.
    const detail = await this.getTransactionById(event.id);
    this.dispatchTransactionAlert(detail);
    return detail;
  }

  // --- Pipeline helpers ------------------------------------------------------

  private buildListWhere(query: GetAllTransactionsQueryDTO, options: { includeResult?: boolean } = {}): Prisma.GateEventWhereInput {
    const includeResult = options.includeResult ?? true;
    const filters: Prisma.GateEventWhereInput[] = [];
    const search = query.search?.trim();

    if (search) {
      filters.push({
        OR: [
          { eventCode: { contains: search, mode: 'insensitive' } },
          { plateNumberRead: { contains: search, mode: 'insensitive' } },
          { rfidTag: { is: { epcId: { contains: search, mode: 'insensitive' } } } },
          { truck: { is: { plateNumber: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    if (includeResult && query.result) {
      filters.push({ result: query.result });
    }

    return filters.length > 0 ? { AND: filters } : {};
  }

  private async getResultCounts(where: Prisma.GateEventWhereInput): Promise<TransactionResultCounts> {
    const groupedCounts = await this.prisma.gateEvent.groupBy({
      by: ['result'],
      where,
      _count: { _all: true },
    });

    const counts = Object.values(GateEventResult).reduce((acc, result) => {
      acc[result] = 0;
      return acc;
    }, {} as TransactionResultCounts);

    for (const group of groupedCounts) {
      counts[group.result] = group._count._all;
    }

    return counts;
  }

  // Fire-and-forget alert email. Email is a side effect of completing the transaction, so a Resend
  // failure (or no configured recipients) must never fail the request — errors are logged instead.
  private dispatchTransactionAlert(transaction: TransactionDetail): void {
    if (transaction.result === GateEventResult.VERIFIED) return;

    const recipients = env.TRANSACTION_ALERT_RECIPIENTS;
    if (recipients.length === 0) {
      this.logger.warn(`No TRANSACTION_ALERT_RECIPIENTS configured; skipping alert for ${transaction.eventCode}`);
      return;
    }

    this.logger.log(`Sending transaction alert for ${transaction.eventCode} (${transaction.result}) to ${recipients.join(', ')}`);
    void this.emailService
      .sendTransactionAlert({ to: recipients, transaction })
      .catch((error) => this.logger.error(`Transaction alert failed for ${transaction.eventCode}`, error instanceof Error ? error.stack : String(error)));
  }

  // Single-file lane: open transactions form a FIFO queue. The truck currently under the
  // cameras/boom is the OLDEST event not yet closed by the barrier step. UHF RFID range can read a
  // following truck early and open a 2nd transaction; that one stays queued behind. So reads attach
  // to the oldest open (FIFO), never the latest — picking "latest" would misroute onto a later truck.
  private async findOpenTransaction(): Promise<OpenTransaction> {
    const event = await this.prisma.gateEvent.findFirst({
      where: {
        result: { notIn: TERMINAL_RESULTS },
        timeline: { none: { type: TimelineEventType.BARRIER_OPENED } },
      },
      orderBy: { occurredAt: 'asc' },
      include: openTransactionInclude,
    });

    if (!event || !event.truck) throw new NotFoundException('No open transaction to attach this read to');

    return event;
  }

  private resolveGateEventResult(input: {
    rfidMatched: boolean;
    tagActive: boolean;
    plateMatched: boolean | null;
    faceMatched: boolean | null;
  }): GateEventResult {
    if (!input.rfidMatched) return GateEventResult.UNKNOWN_TAG;
    if (!input.tagActive) return GateEventResult.DENIED;
    if (input.plateMatched === false) return GateEventResult.PLATE_MISMATCH;
    if (input.faceMatched === false) return GateEventResult.FACE_MISMATCH;
    return GateEventResult.VERIFIED;
  }

  // Daily sequence: GATE-YYYYMMDD-NNNN. Best-effort; eventCode is unique, so a concurrent
  // collision surfaces as a Prisma error rather than a duplicate. Both the date and the count
  // window use the server's local day (matching DashboardService day bucketing); using UTC for
  // the date would print tomorrow's date for late-night passes while the count resets locally.
  private async generateEventCode(occurredAt: Date): Promise<string> {
    const startOfDay = new Date(occurredAt);
    startOfDay.setHours(0, 0, 0, 0);

    const countToday = await this.prisma.gateEvent.count({ where: { occurredAt: { gte: startOfDay } } });

    const year = occurredAt.getFullYear();
    const month = String(occurredAt.getMonth() + 1).padStart(2, '0');
    const day = String(occurredAt.getDate()).padStart(2, '0');
    const datePart = `${year}${month}${day}`;
    const sequence = String(countToday + 1).padStart(4, '0');
    return `GATE-${datePart}-${sequence}`;
  }

  // Keeps sub-events of one stage in order when they're written in the same call.
  private after(date: Date, ms: number): Date {
    return new Date(date.getTime() + ms);
  }
}
