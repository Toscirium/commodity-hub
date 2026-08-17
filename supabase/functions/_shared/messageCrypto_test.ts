import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decryptRow, encryptBody, resetKeyCache } from "./messageCrypto.ts";

// AES-256-GCM needs a 32-byte key; base64 of 32 random bytes.
const TEST_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

function withKey(key: string | undefined, fn: () => Promise<void>) {
  return async () => {
    const previous = Deno.env.get("MESSAGE_ENCRYPTION_KEY");
    if (key === undefined) Deno.env.delete("MESSAGE_ENCRYPTION_KEY");
    else Deno.env.set("MESSAGE_ENCRYPTION_KEY", key);
    resetKeyCache();
    try {
      await fn();
    } finally {
      if (previous === undefined) Deno.env.delete("MESSAGE_ENCRYPTION_KEY");
      else Deno.env.set("MESSAGE_ENCRYPTION_KEY", previous);
      resetKeyCache();
    }
  };
}

Deno.test(
  "encryptBody -> decryptRow round-trips the original plaintext",
  withKey(TEST_KEY, async () => {
    const plaintext = "Long crude here, watching the OPEC+ meeting Thursday.";
    const { body, iv } = await encryptBody(plaintext);
    assertNotEquals(body, plaintext, "ciphertext must not equal the plaintext");
    const decrypted = await decryptRow({ body, iv, encrypted: true });
    assertEquals(decrypted, plaintext);
  }),
);

Deno.test(
  "encryptBody produces a different ciphertext and iv each call (random nonce)",
  withKey(TEST_KEY, async () => {
    const a = await encryptBody("same message");
    const b = await encryptBody("same message");
    assertNotEquals(a.body, b.body);
    assertNotEquals(a.iv, b.iv);
  }),
);

Deno.test(
  "decryptRow passes legacy (pre-encryption) rows through unchanged",
  withKey(TEST_KEY, async () => {
    const legacy = { body: "plain text from before encryption shipped", iv: null, encrypted: false };
    assertEquals(await decryptRow(legacy), legacy.body);
  }),
);

Deno.test(
  "decryptRow with a wrong key returns the fallback string instead of throwing",
  withKey(TEST_KEY, async () => {
    const { body, iv } = await encryptBody("secret plan");
    // Swap to a different key before decrypting — simulates key rotation
    // or a corrupted/mismatched row rather than a crash.
    Deno.env.set("MESSAGE_ENCRYPTION_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    resetKeyCache();
    const decrypted = await decryptRow({ body, iv, encrypted: true });
    assertEquals(decrypted, "[message could not be decrypted]");
  }),
);

Deno.test(
  "getMessageKey throws a clear error when MESSAGE_ENCRYPTION_KEY is unset",
  withKey(undefined, async () => {
    let threw = false;
    try {
      await encryptBody("hello");
    } catch (err) {
      threw = true;
      assertEquals((err as Error).message, "MESSAGE_ENCRYPTION_KEY not set");
    }
    assertEquals(threw, true);
  }),
);
