import { GateEventResult } from '@prisma/client';

// No gate result is terminal: whatever the verification outcome (unknown tag, plate/face mismatch,
// or a deactivated/blocked tag), a real truck is sitting at the gate and the guard is the final
// authority. The barrier opening — automatic (RFID-only policy) or a manual override — is the ONLY
// thing that closes a transaction.
//
// Exception: Philippine expressway toll tags (Autosweep / Easytrip) are not plant tags; transactions
// with EXPRESSWAY_TAG result are completed immediately without opening the barrier.
//
// Open = the barrier has not opened yet and the transaction is not an expressway tag.
export function isTransactionOpen(hasBarrierOpened: boolean, result?: GateEventResult): boolean {
  if (result === GateEventResult.EXPRESSWAY_TAG) {
    return false;
  }
  return !hasBarrierOpened;
}
