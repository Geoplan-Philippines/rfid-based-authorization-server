// Safe-to-return view of an API key. Never includes the secret or its hash.
export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

// Returned only once, at creation time. `key` is the plaintext secret and is never persisted.
export interface CreatedApiKey extends Pick<ApiKeyListItem, 'id' | 'name' | 'prefix' | 'createdAt'> {
  key: string;
}
