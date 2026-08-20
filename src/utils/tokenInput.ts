/**
 * Parses a pasted "token" field into an access token and/or refresh token,
 * so Add Account can offer one input instead of two.
 *
 * Accepts:
 *  - The JSON file downloaded from Settings → Download tokens (or a raw
 *    Microsoft OAuth token response): an object with accessToken/refreshToken
 *    (or access_token/refresh_token) keys.
 *  - A raw access token alone.
 *  - A raw refresh token alone.
 *  - BOTH pasted together in one paste (e.g. copied straight out of a
 *    Telegram notification) — any whitespace between them, since neither
 *    token itself ever contains whitespace.
 *
 * Distinguishing which raw token is which can't be done by counting dots:
 * a real access token is a JWT (three dot-separated segments), but
 * Microsoft's own refresh tokens are ALSO commonly three dot-separated
 * segments — e.g. "1.AR8A....AACAfAA.BQABAwEAAAAD...", a version-prefixed
 * opaque blob that is NOT a JWT. Treating "3 parts" as "is a JWT" therefore
 * misidentifies many real refresh tokens as access tokens (and, when pasted
 * together, the old implementation additionally stripped all whitespace and
 * concatenated both tokens into one unparseable string). The fix is to
 * actually decode the first two segments and require both to be valid JSON
 * — that's true of every JWT header/payload and essentially never true of
 * an opaque refresh token blob.
 */

export interface ParsedTokenInput {
  accessToken: string | null;
  refreshToken: string | null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Base64url-decodes one JWT segment. Returns null on any malformed input rather than throwing. */
function base64UrlDecode(segment: string): string | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return atob(padded + pad);
  } catch {
    return null;
  }
}

/**
 * True only for a genuine JWT: three dot-separated segments whose first two
 * both base64url-decode to valid JSON objects (the header and payload every
 * JWT has). See the file doc comment for why a dot-count check alone isn't
 * enough to tell an access token apart from a refresh token.
 */
function isGenuineJwt(s: string): boolean {
  const parts = s.split('.');
  if (parts.length !== 3) return false;
  const header = base64UrlDecode(parts[0]);
  const payload = base64UrlDecode(parts[1]);
  if (!header || !payload) return false;
  try {
    const h = JSON.parse(header) as unknown;
    const p = JSON.parse(payload) as unknown;
    return typeof h === 'object' && h !== null && typeof p === 'object' && p !== null;
  } catch {
    return false;
  }
}

export function parseTokenInput(raw: string): ParsedTokenInput {
  const trimmed = raw.trim();
  if (!trimmed) return { accessToken: null, refreshToken: null };

  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const accessToken = pickString(obj, ['accessToken', 'access_token']);
      const refreshToken = pickString(obj, ['refreshToken', 'refresh_token']);
      if (accessToken || refreshToken) return { accessToken, refreshToken };
    } catch {
      // Not valid JSON despite the leading brace — fall through and treat
      // the whole thing as raw token(s) below.
    }
  }

  // Split on whitespace rather than stripping it — that's what lets both
  // tokens be pasted together (on separate lines, or with a blank line
  // between them) without mangling either one. Neither an access token nor
  // a refresh token ever contains whitespace itself.
  const words = trimmed.split(/\s+/).filter(Boolean);

  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  for (const word of words) {
    if (isGenuineJwt(word)) {
      if (!accessToken) accessToken = word;
    } else if (!refreshToken) {
      refreshToken = word;
    }
  }

  return { accessToken, refreshToken };
}
