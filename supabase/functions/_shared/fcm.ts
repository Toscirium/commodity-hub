// Firebase Cloud Messaging HTTP v1 sender.
// Uses FCM_SERVICE_ACCOUNT_JSON to mint a short-lived OAuth access token
// via the standard service-account JWT flow, then posts a message to
// https://fcm.googleapis.com/v1/projects/{project_id}/messages:send.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedAccount: ServiceAccount | null = null;

const loadAccount = (): ServiceAccount => {
  if (cachedAccount) return cachedAccount;
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON not set");
  const parsed = JSON.parse(raw);
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error("FCM service account is missing required fields");
  }
  cachedAccount = {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    project_id: parsed.project_id,
    token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
  };
  return cachedAccount;
};

const b64url = (input: ArrayBuffer | Uint8Array | string): string => {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else if (input instanceof Uint8Array) bytes = input;
  else bytes = new Uint8Array(input);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const getAccessToken = async (): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const acct = loadAccount();
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: acct.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: acct.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(acct.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch(acct.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`FCM token exchange failed: ${res.status} ${txt}`);
  }
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) };
  return cachedToken.token;
};

export interface FcmMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmSendResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

export const sendFcmToTokens = async (
  tokens: string[],
  msg: FcmMessage,
): Promise<FcmSendResult> => {
  if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };
  const acct = loadAccount();
  const access = await getAccessToken();
  const url = `https://fcm.googleapis.com/v1/projects/${acct.project_id}/messages:send`;

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: msg.title, body: msg.body },
              data: msg.data ?? {},
              android: { priority: "HIGH" },
            },
          }),
        });
        if (res.ok) {
          sent++;
          await res.text();
        } else {
          failed++;
          const errText = await res.text();
          // 404 UNREGISTERED or 400 INVALID_ARGUMENT for stale tokens
          if (res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/i.test(errText)) {
            invalidTokens.push(token);
          }
        }
      } catch (_e) {
        failed++;
      }
    }),
  );

  return { sent, failed, invalidTokens };
};