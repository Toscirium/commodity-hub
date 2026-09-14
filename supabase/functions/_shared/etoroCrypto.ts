// Encryption at rest for eToro OAuth access/refresh tokens (AES-256-GCM).
// Same tradeoff as _shared's messaging crypto (not present in this repo as
// a shared util — messages/index.ts and messageCrypto.ts keep their own
// copy): this protects a raw DB dump/leak, not the server itself — the
// server holds ETORO_TOKEN_ENCRYPTION_KEY and must be able to decrypt to
// call the eToro API on the user's behalf. A separate key from message
// encryption, deliberately: a leak of one shouldn't compromise the other.

export const b64encode = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

export const b64decode = (b64: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

let cachedKey: Promise<CryptoKey> | null = null;

/** Importing is memoized per isolate; call resetKeyCache() in tests that swap ETORO_TOKEN_ENCRYPTION_KEY. */
export const getEtoroKey = (): Promise<CryptoKey> => {
  if (!cachedKey) {
    const raw = Deno.env.get('ETORO_TOKEN_ENCRYPTION_KEY');
    if (!raw) throw new Error('ETORO_TOKEN_ENCRYPTION_KEY not set');
    cachedKey = crypto.subtle.importKey('raw', b64decode(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return cachedKey;
};

export const resetEtoroKeyCache = (): void => { cachedKey = null; };

export interface EncryptedField {
  ciphertext: string;
  iv: string;
}

export const encryptToken = async (plaintext: string): Promise<EncryptedField> => {
  const key = await getEtoroKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { ciphertext: b64encode(new Uint8Array(ciphertext)), iv: b64encode(iv) };
};

export const decryptToken = async (field: EncryptedField): Promise<string> => {
  const key = await getEtoroKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(field.iv) },
    key,
    b64decode(field.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
};
