import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GateEventResult, Prisma, RFIDTagStatus, SnapshotType, TimelineEventType } from '@prisma/client';
import { addMilliseconds } from 'date-fns';
import { nanoid } from 'nanoid';

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

// --- Hardcoded fallbacks ----------------------------------------------------
// Used only when a device/service omits an optional field (e.g. manual testing). Real devices
// will always supply confidence + snapshot URLs.
const HARDCODED_PLATE_CONFIDENCE = 0.96; // TODO: always provided by the OCR service
const HARDCODED_FACE_CONFIDENCE = 0.88; // TODO: always provided by the face-recognition service
const PLACEHOLDER_SNAPSHOT_URL = 'https://placeholder.local/snapshot.jpg'; // TODO: real capture storage

// Gate event code: GATE- prefix + a short random id. Not sequential or human-decodable — there's
// no readable-sequence requirement, and a random id removes the previous per-day DB count (and the
// race where two simultaneous reads could collide on the same number). 7 chars over nanoid's
// 64-char alphabet keeps collisions negligible at gate throughput.
const EVENT_CODE_PREFIX = 'GATE';
const EVENT_CODE_LENGTH = 7;
const generateEventCode = (): string => `${EVENT_CODE_PREFIX}-${nanoid(EVENT_CODE_LENGTH)}`;

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
        eventCode: generateEventCode(),
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
              ? [{ type: TimelineEventType.TAG_VALIDATED, message: `bound to ${truck.plateNumber}`, occurredAt: addMilliseconds(occurredAt, 1) }]
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

    // No bound truck (unknown tag) → there is no plate to compare against, so this is never a match.
    const plateMatched = event.truck ? body.plateNumberRead === event.truck.plateNumber : false;

    // Recompute from the real tag state so a flagged transaction keeps its result through this
    // stage: an unknown tag stays UNKNOWN_TAG and a deactivated tag stays DENIED. Only the barrier
    // override closes it.
    const { rfidMatched, tagActive } = this.getTagState(event);
    const now = new Date();
    const result = this.resolveGateEventResult({
      rfidMatched,
      tagActive,
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
              data: { gateEventId: event.id, type: TimelineEventType.PLATE_MATCHED, message: 'matches bound truck', occurredAt: addMilliseconds(now, 1) },
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
  // transaction; the backend computes the match against the truck's assigned driver. This is the
  // final pipeline stage: on a valid (matched + active) tag it also opens the barrier automatically
  // (RFID-only policy), closing the transaction. An invalid tag is left open for a manual override.
  async recordFaceRead(body: RecordFaceReadDTO): Promise<TransactionDetail> {
    const event = await this.findOpenTransaction();
    // Idempotency: the face stage runs once. A retry (already-stamped verification) is rejected
    // rather than appending duplicate timeline rows + snapshots.
    if (event.verification && event.verification.faceMatched !== null) {
      throw new ConflictException('Face read already recorded for this transaction');
    }

    // A truck may have several ACTIVE assignments (PRIMARY + RELIEF). The recognised
    // driver matches if they hold ANY active assignment on this truck.
    const assignedDriverIds = event.truck?.driverAssignments.map((assignment) => assignment.driverId) ?? [];

    if (body.driverId) {
      const driver = await this.prisma.driver.findUnique({ where: { id: body.driverId } });
      if (!driver) throw new BadRequestException('Recognised driver does not exist');
    }

    // Match = the recognised driver holds any active assignment on this truck. An unrecognised
    // face (no driverId) is a non-match.
    const faceMatched = body.driverId !== undefined && assignedDriverIds.includes(body.driverId);

    // The result is recomputed from the real tag state so a flagged transaction (unknown or
    // deactivated tag) keeps its result. A valid (matched + active) tag is the RFID-only auto-open
    // trigger: this is the final pipeline stage, so once the face read lands the barrier opens
    // automatically — even on a plate/face mismatch (the result is left flagged for review). An
    // unknown/deactivated tag does NOT auto-open; it stays open for a manual barrier override.
    const { rfidMatched, tagActive, verified: rfidVerified } = this.getTagState(event);

    const now = new Date();
    const result = this.resolveGateEventResult({
      rfidMatched,
      tagActive,
      plateMatched: event.verification?.plateMatched ?? null,
      faceMatched,
    });

    // +2ms places the barrier after this stage's timeline entries: FACE_CAPTURED (+0) and, when the
    // face matches, FACE_MATCHED (+1) — so the auto-open reads last in the ordering.
    const barrierOpenedAt = addMilliseconds(now, 2);

    await this.prisma.$transaction([
      this.prisma.gateEvent.update({
        where: { id: event.id },
        data: { result, driver: body.driverId ? { connect: { id: body.driverId } } : undefined },
      }),
      this.prisma.eventVerification.update({
        where: { gateEventId: event.id },
        data: {
          faceMatched,
          faceConfidence: body.faceConfidence ?? HARDCODED_FACE_CONFIDENCE,
          ...(rfidVerified ? { verifiedAt: barrierOpenedAt } : {}),
        },
      }),
      this.prisma.gateTimelineEvent.create({
        data: { gateEventId: event.id, type: TimelineEventType.FACE_CAPTURED, message: 'snapshot stored', occurredAt: now },
      }),
      ...(faceMatched
        ? [
            this.prisma.gateTimelineEvent.create({
              data: { gateEventId: event.id, type: TimelineEventType.FACE_MATCHED, message: 'matches assigned driver', occurredAt: addMilliseconds(now, 1) },
            }),
          ]
        : []),
      this.prisma.gateSnapshot.create({
        data: { gateEventId: event.id, type: SnapshotType.FACE, imageUrl: body.snapshotUrl ?? PLACEHOLDER_SNAPSHOT_URL },
      }),
      // RFID-only policy: a valid tag opens the barrier automatically at the end of the pipeline.
      ...(rfidVerified
        ? [
            this.prisma.gateTimelineEvent.create({
              data: { gateEventId: event.id, type: TimelineEventType.BARRIER_OPENED, message: 'RFID-only policy', occurredAt: barrierOpenedAt },
            }),
          ]
        : []),
    ]);

    const detail = await this.getTransactionById(event.id);
    // A flagged-but-auto-opened transaction (plate/face mismatch on a valid tag) still alerts
    // reviewers once it closes.
    if (rfidVerified) this.dispatchTransactionAlert(detail);
    return detail;
  }

  // Stage 4 — barrier open. The final step: closes the transaction. Triggered from the operator
  // console; in production the RFID controller also opens the boom locally (GPIO) on a valid tag.
  // RFID-only policy: a valid, active tag opens the barrier AUTOMATICALLY regardless of plate/face
  // mismatches — that is a normal close, not an override, and the result is left as-is (e.g. it
  // stays PLATE_MISMATCH/FACE_MISMATCH for review). Only an invalid tag (unknown or deactivated)
  // has nothing to auto-open on, so the guard's action there is a manual override: it forces the
  // result to MANUAL_OVERRIDE and records the acting operator + reason.
  async recordBarrierOpened(operator: AuthenticatedUser, body: RecordBarrierEventDTO): Promise<TransactionDetail> {
    const event = await this.findOpenTransaction();
    const now = new Date();
    const isOverride = !this.getTagState(event).verified;
    // The override branch logs a MANUAL_OVERRIDE entry at `now` first, so the barrier opens one tick
    // later; a normal close opens at `now`. verifiedAt tracks this same instant.
    const barrierOpenedAt = isOverride ? addMilliseconds(now, 1) : now;

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
          occurredAt: barrierOpenedAt,
        },
      }),
      this.prisma.eventVerification.update({ where: { gateEventId: event.id }, data: { verifiedAt: barrierOpenedAt } }),
    ]);

    // The transaction is now complete (barrier opened). Alert reviewers if it closed on a
    // non-VERIFIED result — the email then reflects the final state, including any override.
    //
    // No double-alert with recordFaceRead's auto-open: a valid tag that ran the full pipeline is
    // already closed there, so findOpenTransaction above would have thrown before reaching here.
    // This path only fires when the barrier is opened directly — a manual override, or a valid tag
    // closed early because the face/plate stage never ran. In that early-close case the alert may
    // fire on a flagged result (e.g. a plate mismatch on a valid tag): that is intended, not a bug —
    // the guard opened without full verification and reviewers should see it.
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
  // An open transaction may have no bound truck (UNKNOWN_TAG — the scanned tag isn't in the
  // registry). That event still stays open so a real truck sitting at the gate can be carried
  // through the pipeline and closed by a manual barrier override. Callers must therefore treat
  // `truck` as nullable rather than assume it's present.
  private async findOpenTransaction(): Promise<OpenTransaction> {
    const event = await this.prisma.gateEvent.findFirst({
      where: {
        timeline: { none: { type: TimelineEventType.BARRIER_OPENED } },
      },
      orderBy: { occurredAt: 'asc' },
      include: openTransactionInclude,
    });

    if (!event) throw new NotFoundException('No open transaction to attach this read to');

    return event;
  }

  // Tag state derived from the linked RFID tag, the single place that reads it. `verified` (matched
  // + active) is the RFID-only condition for an automatic barrier open / a non-override close;
  // `rfidMatched`/`tagActive` feed result resolution so an unknown tag resolves to UNKNOWN_TAG and a
  // deactivated one to DENIED.
  private getTagState(event: OpenTransaction): { rfidMatched: boolean; tagActive: boolean; verified: boolean } {
    const rfidMatched = event.rfidTag !== null;
    const tagActive = event.rfidTag?.status === RFIDTagStatus.ACTIVE;
    return { rfidMatched, tagActive, verified: rfidMatched && tagActive };
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
}
