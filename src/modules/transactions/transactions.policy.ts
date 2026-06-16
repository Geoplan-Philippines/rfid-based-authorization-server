import { GateEventResult } from '@prisma/client';

// A terminal result never proceeds to plate/face recognition or a barrier, so such events are
// never "open" (no truck waiting at the barrier for later reads to attach to).
export const TERMINAL_RESULTS: GateEventResult[] = [GateEventResult.UNKNOWN_TAG, GateEventResult.DENIED];

// Open = still mid-pipeline: not a terminal result and the barrier has not opened yet. This is the
// single source of truth shared by the service's "find open transaction" query and the mapped
// `isOpen` display flag, so they can never drift apart.
export function isTransactionOpen(result: GateEventResult, hasBarrierOpened: boolean): boolean {
  return !TERMINAL_RESULTS.includes(result) && !hasBarrierOpened;
}
