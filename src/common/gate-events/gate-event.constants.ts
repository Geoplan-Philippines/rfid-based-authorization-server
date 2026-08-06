import { GateEventResult } from '@prisma/client';

export const EXCEPTION_GATE_EVENT_RESULTS = [
  GateEventResult.UNKNOWN_TAG,
  GateEventResult.FACE_MISMATCH,
  GateEventResult.PLATE_MISMATCH,
  GateEventResult.DENIED,
  GateEventResult.ERROR,
] as const;

export type ExceptionGateEventResult = (typeof EXCEPTION_GATE_EVENT_RESULTS)[number];

const EXCEPTION_GATE_EVENT_RESULT_SET = new Set<GateEventResult>(EXCEPTION_GATE_EVENT_RESULTS);

export function isExceptionGateEventResult(result: GateEventResult): result is ExceptionGateEventResult {
  return EXCEPTION_GATE_EVENT_RESULT_SET.has(result);
}
