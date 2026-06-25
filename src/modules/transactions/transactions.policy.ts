// No gate result is terminal: whatever the verification outcome (unknown tag, plate/face mismatch,
// or a deactivated/blocked tag), a real truck is sitting at the gate and the guard is the final
// authority. The barrier opening — automatic (RFID-only policy) or a manual override — is the ONLY
// thing that closes a transaction.
//
// Open = the barrier has not opened yet. This is the single source of truth shared by the service's
// "find open transaction" query and the mapped `isOpen` display flag, so they can never drift apart.
export function isTransactionOpen(hasBarrierOpened: boolean): boolean {
  return !hasBarrierOpened;
}
