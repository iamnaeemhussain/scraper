const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeString(str: string): string {
  return base64UrlEncodeBytes(encoder.encode(str));
}

function base64UrlDecodeString(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Constant-time string comparison via SHA-256 digests so neither content nor length leaks via timing.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  const ua = new Uint8Array(da);
  const ub = new Uint8Array(db);
  let diff = a.length ^ b.length;
  for (let i = 0; i < ua.length; i++) {
    diff |= ua[i] ^ ub[i];
  }
  return diff === 0;
}

export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return bytesToHex(new Uint8Array(sig));
}

export async function signAdminJwt(
  payload: { sub: string; email: string; role: 'ADMIN' },
  jwtSecret: string,
  ttlSeconds = 12 * 3600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const headerB64 = base64UrlEncodeString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const bodyB64 = base64UrlEncodeString(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + ttlSeconds,
    }),
  );
  const signingInput = `${headerB64}.${bodyB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

export async function verifyAdminJwt(
  token: string,
  jwtSecret: string,
): Promise<{ sub: string; email: string; role: 'ADMIN' } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, sigB64] = parts;
  const signingInput = `${headerB64}.${bodyB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expectedBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput)),
  );
  const expectedB64 = base64UrlEncodeBytes(expectedBytes);
  const validSig = await constantTimeEqual(sigB64, expectedB64);
  if (!validSig) return null;

  try {
    const claims = JSON.parse(base64UrlDecodeString(bodyB64));
    const now = Math.floor(Date.now() / 1000);
    if (!claims || claims.role !== 'ADMIN' || typeof claims.exp !== 'number' || claims.exp < now) {
      return null;
    }
    return { sub: String(claims.sub), email: String(claims.email), role: 'ADMIN' };
  } catch {
    return null;
  }
}

export function normalizeSecretSlug(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

export async function verifyAdminSecretPath(
  candidateHeaderOrQuery: string | null | undefined,
  configuredSecretPath: string | null | undefined,
): Promise<boolean> {
  const configured = normalizeSecretSlug(configuredSecretPath);
  const candidate = normalizeSecretSlug(candidateHeaderOrQuery);
  if (!configured || !candidate) return false;
  return constantTimeEqual(candidate, configured);
}

export async function verifyDpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  webhookSecret: string | null | undefined,
  toleranceSeconds = 300,
): Promise<{ ok: boolean; error?: string }> {
  const secret = String(webhookSecret || '').trim();
  if (!secret) {
    return { ok: false, error: 'DPAY_WEBHOOK_SECRET is not configured in runtime secrets' };
  }
  if (!signatureHeader) {
    return { ok: false, error: 'Missing DPay-Signature header' };
  }

  let timestamp = '';
  let v1 = '';
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k === 't') timestamp = v || '';
    if (k === 'v1') v1 = v || '';
  }

  if (!v1) {
    v1 = signatureHeader.replace(/^sha256=/i, '').trim();
  }
  if (!v1) {
    return { ok: false, error: 'Malformed DPay-Signature header' };
  }

  if (timestamp) {
    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
      return { ok: false, error: 'Invalid DPay-Signature timestamp' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > toleranceSeconds) {
      return { ok: false, error: 'DPay webhook timestamp outside replay window' };
    }
  }

  const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  const expected = await hmacSha256Hex(secret, signedPayload);
  const matches = await constantTimeEqual(v1.toLowerCase(), expected.toLowerCase());
  return matches ? { ok: true } : { ok: false, error: 'Invalid DPay webhook HMAC signature' };
}

export async function verifyMailjetWebhookAuth(
  authorizationHeader: string | null | undefined,
  queryToken: string | null | undefined,
  configuredSecret: string | null | undefined,
): Promise<boolean> {
  const secret = String(configuredSecret || '').trim();
  if (!secret) {
    // Mailjet webhooks allow optional Basic Auth; if MAILJET_WEBHOOK_SECRET is unset, accept events
    return true;
  }
  if (queryToken && (await constantTimeEqual(queryToken.trim(), secret))) {
    return true;
  }
  if (authorizationHeader) {
    if (authorizationHeader.toLowerCase().startsWith('basic ')) {
      try {
        const decoded = atob(authorizationHeader.slice(6).trim());
        // Either "user:secret" matches full string OR password part matches secret
        if (await constantTimeEqual(decoded, secret)) return true;
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          const pass = decoded.slice(colonIdx + 1);
          if (await constantTimeEqual(pass, secret)) return true;
        }
      } catch {
        return false;
      }
    } else if (authorizationHeader.toLowerCase().startsWith('bearer ')) {
      return constantTimeEqual(authorizationHeader.slice(7).trim(), secret);
    }
  }
  return false;
}
