// Encryption at rest for direct-message bodies (AES-256-GCM). This is NOT
// end-to-end — the server holds the key (MESSAGE_ENCRYPTION_KEY, an edge
// function secret) and can read messages, same as it must to render
// previews/search. It protects against a raw DB dump/leak. True E2EE would
// mean per-user client-held keys and a much bigger client-side crypto
// surface — a deliberately separate, bigger decision (see
// supabase/functions/messages/index.ts for the rationale).

export const b64encode = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

// Return type is explicitly Uint8Array<ArrayBuffer> (not bare Uint8Array,
// which this lib's typings default to the looser Uint8Array<ArrayBufferLike>)
// so this satisfies crypto.subtle's BufferSource params without a cast.
export const b64decode = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

let cachedKey: Promise<CryptoKey> | null = null;

/** Importing is memoized per isolate; call resetKeyCache() in tests that swap MESSAGE_ENCRYPTION_KEY. */
export const getMessageKey = (): Promise<CryptoKey> => {
  if (!cachedKey) {
    const raw = Deno.env.get('MESSAGE_ENCRYPTION_KEY');
    if (!raw) throw new Error('MESSAGE_ENCRYPTION_KEY not set');
    cachedKey = crypto.subtle.importKey('raw', b64decode(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return cachedKey;
};

export const resetKeyCache = (): void => { cachedKey = null; };

export const encryptBody = async (plaintext: string): Promise<{ body: string; iv: string }> => {
  const key = await getMessageKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { body: b64encode(new Uint8Array(ciphertext)), iv: b64encode(iv) };
};

export interface EncryptedRow {
  body: string;
  iv: string | null;
  encrypted: boolean;
}

/** Falls back to the raw body for pre-encryption legacy rows (encrypted: false). */
export const decryptRow = async (row: EncryptedRow): Promise<string> => {
  if (!row.encrypted || !row.iv) return row.body;
  try {
    const key = await getMessageKey();
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(row.iv) }, key, b64decode(row.body));
    return new TextDecoder().decode(plaintext);
  } catch {
    return '[message could not be decrypted]';
  }
};
