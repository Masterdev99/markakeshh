/**
 * Parses a single pasted "token" field into an access token and/or refresh
 * token, so Add Account can offer one input instead of two.
 *
 * Accepts three shapes:
 *  - The JSON file downloaded from Settings → Download tokens (or a raw
 *    Microsoft OAuth token response): an object with accessToken/refreshToken
 *    (or access_token/refresh_token) keys.
 *  - A raw access token — a JWT, i.e. three dot-separated segments
 *    (matches the same shape check isTokenExpired() uses to decode one).
 *  - A raw refresh token — anything else non-empty; Microsoft refresh
 *    tokens are opaque blobs with no fixed shape to check against.
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

function looksLikeJwt(s: string): boolean {
  return s.split('.').length === 3;
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
      // the whole thing as a raw token below.
    }
  }

  const cleaned = trimmed.replace(/[\s\r\n]+/g, '');
  if (!cleaned) return { accessToken: null, refreshToken: null };

  return looksLikeJwt(cleaned)
    ? { accessToken: cleaned, refreshToken: null }
    : { accessToken: null, refreshToken: cleaned };
}
