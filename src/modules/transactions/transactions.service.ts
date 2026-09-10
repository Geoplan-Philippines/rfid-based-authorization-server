import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GateEventResult, Prisma, RFIDTagStatus, SnapshotType, TimelineEventType } from '@prisma/client';
import { addMilliseconds } from 'date-fns';
import { nanoid } from 'nanoid';

import { PrismaService } from '../../core/database/prisma.service';
import { BAN_ENTITY_TYPE, BAN_TYPE, type BanEntityType } from 'src/common/bans/ban.constants';
import { describeBan, formatBanUntilDate, isBanActive, type BanState } from 'src/common/bans/ban.utils';
import { env } from 'src/core/config/env.config';
import { EmailService } from '../email/email.service';
import type { BanPresentationAlert } from '../email/dto/send-ban-presentation-alert.dto';
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
    const truckBanned = isBanActive(truck);
    const canVerify = truck !== null && tagActive;

    // No plate/face yet: the result is provisional and recomputed as later stages report in.
    const result = this.resolveGateEventResult({
      rfidMatched,
      tagActive,
      truckBanned,
      driverBanned: false,
      plateMatched: null,
      faceMatched: null,
    });
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
            ...(truck && truckBanned
              ? [{
                  type: TimelineEventType.BANNED_ENTITY_DETECTED,
                  message: this.bannedEntityMessage(BAN_ENTITY_TYPE.truck, truck.plateNumber, truck),
                  metadata: this.bannedEntityMetadata(BAN_ENTITY_TYPE.truck, truck),
                  occurredAt: addMilliseconds(occurredAt, 2),
                }]
              : []),
          ],
        },
      },
      include: transactionDetailInclude,
    });

    const detail = toTransactionDetail(event);
    if (truck && truckBanned) this.dispatchBanPresentationAlert(this.toTruckBanPresentation(detail, truck));
    return detail;
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
    const { rfidMatched, tagActive, truckBanned } = this.getTagState(event);
    const now = new Date();
    const result = this.resolveGateEventResult({
      rfidMatched,
      tagActive,
      truckBanned,
      driverBanned: false,
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

    const assignedDriverId = event.truck?.driverAssignments[0]?.driverId ?? null;
    let recognizedDriver: (BanState & { id: string; firstName: string; lastName: string; licenseNumber: string }) | null = null;

    if (body.driverId) {
      const driver = await this.prisma.driver.findUnique({ where: { driverId: body.driverId } });
      if (!driver) throw new BadRequestException('Recognised driver does not exist');
      recognizedDriver = driver;
    }

    // Match = the recognised driver is the one assigned to this truck. An unrecognised face
    // (no driverId) is a non-match.
    const faceMatched = recognizedDriver !== null && recognizedDriver.id === assignedDriverId;
    const driverBanned = isBanActive(recognizedDriver);

    // The result is recomputed from the real tag and ban state so a flagged transaction (unknown
    // tag, deactivated tag, or banned truck/driver) keeps its result. A valid (matched + active)
    // unbanned tag is the RFID-only auto-open trigger: this is the final pipeline stage, so once
    // the face read lands the barrier opens automatically — even on a plate/face mismatch (the
    // result is left flagged for review). An unknown/deactivated tag or a banned entity does NOT
    // auto-open; it stays open for a manual barrier override.
    const { rfidMatched, tagActive, truckBanned, verified: rfidVerified } = this.getTagState(event, recognizedDriver);

    const now = new Date();
    const result = this.resolveGateEventResult({
      rfidMatched,
      tagActive,
      truckBanned,
      driverBanned,
      plateMatched: event.verification?.plateMatched ?? null,
      faceMatched,
    });

    // +2ms places the barrier after this stage's timeline entries: FACE_CAPTURED (+0) and, when the
    // face matches, FACE_MATCHED (+1) — so the auto-open reads last in the ordering.
    const barrierOpenedAt = addMilliseconds(now, 2);

    await this.prisma.$transaction([
      this.prisma.gateEvent.update({
        where: { id: event.id },
        data: { result, driver: recognizedDriver ? { connect: { id: recognizedDriver.id } } : undefined },
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
      ...(recognizedDriver && driverBanned
        ? [
            this.prisma.gateTimelineEvent.create({
              data: {
                gateEventId: event.id,
                type: TimelineEventType.BANNED_ENTITY_DETECTED,
                message: this.bannedEntityMessage(BAN_ENTITY_TYPE.driver, `${recognizedDriver.firstName} ${recognizedDriver.lastName}`, recognizedDriver),
                metadata: this.bannedEntityMetadata(BAN_ENTITY_TYPE.driver, recognizedDriver),
                occurredAt: addMilliseconds(now, faceMatched ? 2 : 1),
              },
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
    if (recognizedDriver && driverBanned) this.dispatchBanPresentationAlert(this.toDriverBanPresentation(detail, recognizedDriver));
    // A flagged-but-auto-opened transaction (plate/face mismatch on a valid unbanned tag) still
    // alerts reviewers once it closes. Banned presentations send their own ops email above and do
    // not auto-open, so they do not use this path.
    if (rfidVerified) this.dispatchTransactionAlert(detail);
    return detail;
  }

  // Stage 4 — barrier open. The final step: closes the transaction. Triggered from the operator
  // console; in production the RFID controller also opens the boom locally (GPIO) on a valid tag.
  // RFID-only policy: a valid, active, unbanned tag opens the barrier AUTOMATICALLY regardless of
  // plate/face mismatches — that is a normal close, not an override, and the result is left as-is
  // (e.g. it stays PLATE_MISMATCH/FACE_MISMATCH for review). Only an invalid tag (unknown or
  // deactivated) or a banned truck/driver has nothing to auto-open on, so the guard's action there
  // is a manual override: it forces the result to MANUAL_OVERRIDE and records the acting operator
  // + reason.
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

  private dispatchBanPresentationAlert(presentation: BanPresentationAlert): void {
    const recipients = env.TRANSACTION_ALERT_RECIPIENTS;
    if (recipients.length === 0) {
      this.logger.warn(`No TRANSACTION_ALERT_RECIPIENTS configured; skipping ban alert for ${presentation.eventCode}`);
      return;
    }

    this.logger.log(`Sending ban presentation alert for ${presentation.eventCode} (${presentation.entityType}, ${presentation.banType}) to ${recipients.join(', ')}`);
    void this.emailService
      .sendBanPresentationAlert({ to: recipients, presentation })
      .catch((error) => this.logger.error(`Ban presentation alert failed for ${presentation.eventCode}`, error instanceof Error ? error.stack : String(error)));
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

  // Tag and ban state derived from the linked RFID tag, bound truck, and recognised driver. `verified`
  // (matched + active + not banned) is the RFID-only condition for an automatic barrier open / a
  // non-override close. Plate/face mismatches still verify. A banned truck or banned driver does not.
  private getTagState(
    event: OpenTransaction,
    recognizedDriver: BanState | null = event.driver,
  ): { rfidMatched: boolean; tagActive: boolean; truckBanned: boolean; driverBanned: boolean; verified: boolean } {
    const rfidMatched = event.rfidTag !== null;
    const tagActive = event.rfidTag?.status === RFIDTagStatus.ACTIVE;
    const truckBanned = isBanActive(event.truck);
    const driverBanned = isBanActive(recognizedDriver);
    return {
      rfidMatched,
      tagActive,
      truckBanned,
      driverBanned,
      verified: rfidMatched && tagActive && !truckBanned && !driverBanned,
    };
  }

  private resolveGateEventResult(input: {
    rfidMatched: boolean;
    tagActive: boolean;
    truckBanned: boolean;
    driverBanned: boolean;
    plateMatched: boolean | null;
    faceMatched: boolean | null;
  }): GateEventResult {
    if (!input.rfidMatched) return GateEventResult.UNKNOWN_TAG;
    if (input.truckBanned || input.driverBanned) return GateEventResult.BANNED;
    if (!input.tagActive) return GateEventResult.DENIED;
    if (input.plateMatched === false) return GateEventResult.PLATE_MISMATCH;
    if (input.faceMatched === false) return GateEventResult.FACE_MISMATCH;
    return GateEventResult.VERIFIED;
  }

  private toTruckBanPresentation(
    event: Pick<TransactionDetail, 'eventCode' | 'occurredAt'>,
    truck: BanState & { plateNumber: string },
  ): BanPresentationAlert {
    return {
      eventCode: event.eventCode,
      occurredAt: event.occurredAt,
      entityType: BAN_ENTITY_TYPE.truck,
      subjectName: truck.plateNumber,
      identifier: truck.plateNumber,
      ...describeBan(truck),
    };
  }

  private toDriverBanPresentation(
    event: Pick<TransactionDetail, 'eventCode' | 'occurredAt'>,
    driver: BanState & { firstName: string; lastName: string; licenseNumber: string },
  ): BanPresentationAlert {
    return {
      eventCode: event.eventCode,
      occurredAt: event.occurredAt,
      entityType: BAN_ENTITY_TYPE.driver,
      subjectName: `${driver.firstName} ${driver.lastName}`,
      identifier: driver.licenseNumber,
      ...describeBan(driver),
    };
  }

  private bannedEntityMessage(entityType: BanEntityType, name: string, state: BanState): string {
    const ban = describeBan(state);
    if (ban.banType === BAN_TYPE.permanent) return `${entityType.toLowerCase()} ${name} permanently banned`;
    return `${entityType.toLowerCase()} ${name} banned until ${ban.bannedUntil ? formatBanUntilDate(ban.bannedUntil) : 'date'}`;
  }

  private bannedEntityMetadata(entityType: BanEntityType, state: BanState): Prisma.InputJsonValue {
    const ban = describeBan(state);
    return {
      entityType,
      banType: ban.banType,
      bannedUntil: ban.bannedUntil ? formatBanUntilDate(ban.bannedUntil) : null,
    };
  }
}
