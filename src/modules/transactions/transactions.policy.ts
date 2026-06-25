import { GateEventResult } from '@prisma/client';

// No gate result is terminal: whatever the verification outcome (unknown tag, plate/face mismatch,
// or a deactivated/blocked tag), a real truck is sitting at the gate and the guard is the final
// authority. Every transaction therefore stays open until the barrier step closes it — including
// via a manual override. The barrier opening is the ONLY thing that closes a transaction.
export const TERMINAL_RESULTS: GateEventResult[] = [];

// Open = the barrier has not opened yet. This is the single source of truth shared by the service's
// "find open transaction" query and the mapped `isOpen` display flag, so they can never drift apart.
export function isTransactionOpen(hasBarrierOpened: boolean): boolean {
  return !hasBarrierOpened;
}
