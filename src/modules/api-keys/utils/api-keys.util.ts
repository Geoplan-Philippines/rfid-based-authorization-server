import { createHash, randomBytes } from 'node:crypto';

// Visible, non-secret prefix so a key is recognisable as ours and listable by a short fragment.
const API_KEY_PREFIX = 'rfid_';
// Bytes of entropy in the secret portion (24 bytes = 192 bits, hex-encoded).
const API_KEY_ENTROPY_BYTES = 24;
// Length of the leading fragment stored for display (prefix + first 7 hex chars).
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 7;

/** Generates a fresh, high-entropy API key. The plaintext is shown to the caller only once. */
export const generateApiKey = (): string => `${API_KEY_PREFIX}${randomBytes(API_KEY_ENTROPY_BYTES).toString('hex')}`;

/**
 * Hashes a key for storage and lookup. API keys are high-entropy random values, so a fast
 * SHA-256 is appropriate (unlike user passwords) and lets us look a key up by its hash in O(1).
 */
export const hashApiKey = (raw: string): string => createHash('sha256').update(raw).digest('hex');

/** The short, non-secret fragment shown in listings to identify a key without revealing it. */
export const apiKeyDisplayPrefix = (raw: string): string => raw.slice(0, DISPLAY_PREFIX_LENGTH);
