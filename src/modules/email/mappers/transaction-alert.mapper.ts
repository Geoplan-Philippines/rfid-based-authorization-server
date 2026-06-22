import { GateEventResult, Prisma, TimelineEventType } from '@prisma/client';

import { DriverSummary, TransactionDetail } from 'src/modules/transactions/types/transactions.types';
import { ALERT_FALLBACK, STATUS_COLOR, STATUS_ICON } from '../constants/transaction.constants';

interface StepStyle {
  color: string;
  icon: string;
}

/**
 * Flattens a transaction into the Resend "eagle-cement" template's merge variables. Resend resolves
 * `{{token}}` against a flat string/number map (keys must be alphanumeric/underscore only), so every
 * key here mirrors a `{{token}}` in the template. Presentational keys (colours/icons/labels) let the
 * static template reflect the real transaction state without any template-side logic.
 */
export class TransactionAlertMapper {
  public static buildVariables(t: TransactionDetail): Record<string, string | number> {
    const [rfidScanned, tagValidated] = t.timeline;
    const rfid = TransactionAlertMapper.rfidStep(t);
    const tag = TransactionAlertMapper.tagStep(t);
    const plate = TransactionAlertMapper.plateStep(t.verification?.plateMatched ?? null);
    const face = TransactionAlertMapper.faceStep(t.verification?.faceMatched ?? null);
    const override = TransactionAlertMapper.overrideStep(t);
    const barrier = TransactionAlertMapper.barrierStep(t);

    return {
      // Summary + raw data
      eventCode: t.eventCode,
      plateRead: t.plateRead ?? ALERT_FALLBACK,
      result: TransactionAlertMapper.resultLabel(t),
      occurredAt: TransactionAlertMapper.formatDateTime(t.occurredAt),
      rfidScannedAt: rfidScanned ? TransactionAlertMapper.formatDateTime(rfidScanned.occurredAt) : ALERT_FALLBACK,
      tagValidatedMessage: tagValidated?.message ?? ALERT_FALLBACK,
      rfidEpcId: t.rfidTag?.epcId ?? ALERT_FALLBACK,
      assignedTruckPlate: t.rfidTag?.assignedTruckPlate ?? ALERT_FALLBACK,
      truckModel: t.truck?.model ?? ALERT_FALLBACK,
      registeredDriverFirstName: TransactionAlertMapper.firstName(t.truck?.assignedDriver),
      registeredDriverLastName: TransactionAlertMapper.lastName(t.truck?.assignedDriver),
      detectedDriverFirstName: t.driver?.firstName ?? ALERT_FALLBACK,
      detectedDriverLastName: t.driver?.lastName ?? '',
      faceConfidence: TransactionAlertMapper.formatPercent(t.verification?.faceConfidence ?? null),
      // Narrative copy
      preheaderText: `${TransactionAlertMapper.resultLabel(t)} flagged on event ${t.eventCode}. Review required.`,
      alertMessage: TransactionAlertMapper.alertMessage(t),
      // Process timeline step states (colour/icon/label so the design renders the real outcome)
      rfidStatusColor: rfid.color,
      rfidStatusIcon: rfid.icon,
      tagStatusColor: tag.color,
      tagStatusIcon: tag.icon,
      plateStatusColor: plate.color,
      plateStatusIcon: plate.icon,
      plateStatusLabel: plate.label,
      plateStatusTextColor: plate.textColor,
      faceStatusColor: face.color,
      faceStatusIcon: face.icon,
      overrideStatusColor: override.color,
      overrideStatusIcon: override.icon,
      overrideOperator: override.operator,
      barrierStatusColor: barrier.color,
      barrierStatusIcon: barrier.icon,
      barrierStatusLabel: barrier.label,
      barrierStatusTextColor: barrier.textColor,
    };
  }

  private static firstName(driver: DriverSummary | null | undefined): string {
    return driver?.firstName ?? ALERT_FALLBACK;
  }

  private static lastName(driver: DriverSummary | null | undefined): string {
    return driver?.lastName ?? '';
  }

  /** RFID-scan step: green check once the tag has been read (always true for a real transaction). */
  private static rfidStep(t: TransactionDetail): StepStyle {
    const scanned = t.timeline.some((e) => e.type === TimelineEventType.RFID_SCANNED);
    return scanned ? { color: STATUS_COLOR.green, icon: STATUS_ICON.check } : { color: STATUS_COLOR.grey, icon: STATUS_ICON.dash };
  }

  /** Tag-validation step: green check when the tag bound to a truck, red cross when it didn't. */
  private static tagStep(t: TransactionDetail): StepStyle {
    const validated = t.timeline.some((e) => e.type === TimelineEventType.TAG_VALIDATED);
    return validated ? { color: STATUS_COLOR.green, icon: STATUS_ICON.check } : { color: STATUS_COLOR.red, icon: STATUS_ICON.cross };
  }

  /** Plate-match step: red cross + "Failed" on mismatch, green check + "Passed" when it matched. */
  private static plateStep(matched: boolean | null): StepStyle & { label: string; textColor: string } {
    if (matched === false) return { color: STATUS_COLOR.red, icon: STATUS_ICON.cross, label: 'Failed', textColor: STATUS_COLOR.red };
    if (matched === true) return { color: STATUS_COLOR.green, icon: STATUS_ICON.check, label: 'Passed', textColor: STATUS_COLOR.muted };
    return { color: STATUS_COLOR.grey, icon: STATUS_ICON.dash, label: 'Pending', textColor: STATUS_COLOR.muted };
  }

  /** Face-match step: green check when the driver matched, red cross otherwise. */
  private static faceStep(matched: boolean | null): StepStyle {
    if (matched === false) return { color: STATUS_COLOR.red, icon: STATUS_ICON.cross };
    if (matched === true) return { color: STATUS_COLOR.green, icon: STATUS_ICON.check };
    return { color: STATUS_COLOR.grey, icon: STATUS_ICON.dash };
  }

  /** Manual-override step: amber "!" + operator email when overridden, muted dash + "None" if not. */
  private static overrideStep(t: TransactionDetail): StepStyle & { operator: string } {
    const event = t.timeline.find((e) => e.type === TimelineEventType.MANUAL_OVERRIDE);
    if (!event) return { color: STATUS_COLOR.grey, icon: STATUS_ICON.dash, operator: 'None' };
    return { color: STATUS_COLOR.amber, icon: STATUS_ICON.bang, operator: TransactionAlertMapper.operatorEmail(event.metadata) ?? ALERT_FALLBACK };
  }

  /** Barrier step: green check + "Success" once opened, muted dash + "Pending" before that. */
  private static barrierStep(t: TransactionDetail): StepStyle & { label: string; textColor: string } {
    const opened = t.timeline.some((e) => e.type === TimelineEventType.BARRIER_OPENED);
    return opened
      ? { color: STATUS_COLOR.green, icon: STATUS_ICON.check, label: 'Success', textColor: STATUS_COLOR.green }
      : { color: STATUS_COLOR.grey, icon: STATUS_ICON.dash, label: 'Pending', textColor: STATUS_COLOR.muted };
  }

  /** Pull the operator email out of a MANUAL_OVERRIDE timeline entry's JSON metadata, if present. */
  private static operatorEmail(metadata: Prisma.JsonValue): string | null {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const value = (metadata as Prisma.JsonObject).operatorEmail;
      if (typeof value === 'string') return value;
    }
    return null;
  }

  /** Human-readable explanation shown in the red "Exception Detected" box. */
  private static alertMessage(t: TransactionDetail): string {
    const reasons = TransactionAlertMapper.failureReasons(t);
    const overridden = t.timeline.some((e) => e.type === TimelineEventType.MANUAL_OVERRIDE);

    // Verification failure(s): name them, and note the override if entry was forced through.
    if (reasons.length > 0) {
      const detail = TransactionAlertMapper.joinReadable(reasons.map((r) => r.toLowerCase()));
      const sentence = `Verification flagged ${detail}.`;
      return overridden ? `${sentence} Vehicle entry was completed using a manual override.` : sentence;
    }

    // No plate/face/tag flag set — fall back to a result-specific line.
    switch (t.result) {
      case GateEventResult.DENIED:
        return 'Access denied — the RFID tag is not active.';
      case GateEventResult.UNKNOWN_TAG:
        return 'Unknown RFID tag — no registered truck matches this tag.';
      case GateEventResult.MANUAL_OVERRIDE:
        return 'Vehicle entry was completed using a manual override.';
      case GateEventResult.ERROR:
        return 'An error occurred while processing this transaction.';
      default:
        return 'An exception was detected during gate authorization.';
    }
  }

  /** "MANUAL_OVERRIDE" -> "Manual Override" for display. */
  private static humanizeResult(result: GateEventResult): string {
    return result
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Every failed verification check for this transaction. When the barrier is opened on a flagged
   * event the stored result collapses to MANUAL_OVERRIDE, so the individual plate/face/tag failures
   * are recovered from the verification flags instead of the single enum.
   */
  private static failureReasons(t: TransactionDetail): string[] {
    const v = t.verification;
    const reasons: string[] = [];
    if (v?.rfidMatched === false) reasons.push('Unknown Tag');
    if (v?.plateMatched === false) reasons.push('Plate Mismatch');
    if (v?.faceMatched === false) reasons.push('Face Mismatch');
    return reasons;
  }

  /** Result label: all failed checks joined ("Plate Mismatch, Face Mismatch"), else the enum. */
  private static resultLabel(t: TransactionDetail): string {
    const reasons = TransactionAlertMapper.failureReasons(t);
    return reasons.length > 0 ? reasons.join(', ') : TransactionAlertMapper.humanizeResult(t.result);
  }

  /** Join labels into readable prose: ["a","b"] -> "a and b", ["a","b","c"] -> "a, b and c". */
  private static joinReadable(parts: string[]): string {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  }

  /** 0.5 -> "50%"; null/undefined confidence -> fallback. */
  private static formatPercent(value: number | null): string {
    return value === null ? ALERT_FALLBACK : `${Math.round(value * 100)}%`;
  }

  private static formatDateTime(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
}
