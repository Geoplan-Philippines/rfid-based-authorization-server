import { GateEventResult } from '@prisma/client';

// Results that represent an abnormal pass needing operator review. Mirrors the gate's exception
// semantics: VERIFIED passed cleanly and MANUAL_OVERRIDE was already resolved by an operator, so
// neither is counted as an exception here.
export const EXCEPTION_GATE_RESULTS: GateEventResult[] = [
  GateEventResult.UNKNOWN_TAG,
  GateEventResult.FACE_MISMATCH,
  GateEventResult.PLATE_MISMATCH,
  GateEventResult.DENIED,
  GateEventResult.ERROR,
];

// Rows shown in the dashboard "Needs review" preview panel. The full history lives in the
// transactions list (the panel's "View all transactions" link).
export const NEEDS_REVIEW_PREVIEW_LIMIT = 8;

export const HOURS_PER_DAY = 24;

const EXCEPTION_RESULT_SET = new Set<GateEventResult>(EXCEPTION_GATE_RESULTS);

export function isExceptionResult(result: GateEventResult): boolean {
  return EXCEPTION_RESULT_SET.has(result);
}
