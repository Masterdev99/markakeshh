/**
 * Microsoft Graph API client.
 *
 * THE ONLY PLACE raw fetch() to Graph is allowed to appear.
 * All other code must call graphApi().
 *
 * Ported faithfully from lines 13013–13133.
 *
 * Supports:
 *  - Shorthand call: graphApi(endpoint, accountIdx) where accountIdx is a number
 *  - Token refresh retry on 401, shared across concurrent 401s for the same
 *    account so a burst of requests doesn't each kick off its own refresh call
 *  - Rate-limit (429) exponential back-off
 *  - Generic retry on transient errors
 *  - /beta/ prefix (maps to beta endpoint instead of v1.0)
 *  - Plain text / $count responses (non-JSON)
 */

import { refreshToken } from './auth';

/** Module-level accounts reference — injected by the store on startup */
let _accounts: Array<{ accessToken: string; refreshToken?: string | null }> = [];

export function setGraphAccounts(accounts: typeof _accounts): void {
  _accounts = accounts;
}

/**
 * In-flight refresh promises, keyed by account index. Several requests can
 * hit a 401 for the same account within milliseconds of each other (e.g. the
 * folder tree, message list, and admin-role check all firing on startup) —
 * without this, each would independently call the token endpoint at once.
 */
const refreshInFlight = new Map<number, Promise<void>>();

function refreshTokenOnce(accountIdx: number, accounts: typeof _accounts): Promise<void> {
  let promise = refreshInFlight.get(accountIdx);
  if (!promise) {
    promise = refreshToken(accountIdx, accounts).finally(() => {
      refreshInFlight.delete(accountIdx);
    });
    refreshInFlight.set(accountIdx, promise);
  }
  return promise;
}

const GRAPH_V1 = 'https://graph.microsoft.com/v1.0';
const GRAPH_BETA = 'https://graph.microsoft.com';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface GraphApiOptions {
  method?: HttpMethod;
  body?: unknown;
  retries?: number;
  accountIdx?: number | null;
  extraHeaders?: Record<string, string>;
}

async function makeRequest(
  endpoint: string,
  authToken: string,
  method: HttpMethod,
  body: unknown,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: 'Bearer ' + authToken,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  };
  if (body !== null && body !== undefined && method !== 'GET' && method !== 'DELETE') {
    opts.body = JSON.stringify(body);
  }
  const url = endpoint.startsWith('/beta/')
    ? GRAPH_BETA + endpoint
    : GRAPH_V1 + endpoint;
  return fetch(url, opts);
}

async function parseResponse(resp: Response): Promise<unknown> {
  if (resp.status === 204) return null;
  const ct = resp.headers.get('content-type') || '';
  if (ct.includes('application/json')) return resp.json();
  const text = await resp.text();
  const num = Number(text);
  if (!isNaN(num) && text.trim() !== '') return num;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function graphApi(
  endpoint: string,
  tokenOrIdx: string | number,
  optionsOrMethod?: HttpMethod | GraphApiOptions,
  body?: unknown,
  retries?: number,
  accountIdx?: number | null,
  extraHeaders?: Record<string, string>
): Promise<unknown> {
  // Support shorthand: graphApi(endpoint, accountIdx)
  let token: string;
  let _accountIdx: number | null = null;

  if (typeof tokenOrIdx === 'number') {
    _accountIdx = tokenOrIdx;
    token = _accounts[tokenOrIdx]?.accessToken || '';
  } else {
    token = tokenOrIdx;
    _accountIdx = accountIdx ?? null;
  }

  // Normalise options
  let method: HttpMethod = 'GET';
  let _body: unknown = null;
  let _retries = 3;
  let _extraHeaders: Record<string, string> | undefined;

  if (typeof optionsOrMethod === 'string') {
    method = optionsOrMethod;
    _body = body ?? null;
    _retries = retries ?? 3;
    _extraHeaders = extraHeaders;
  } else if (optionsOrMethod && typeof optionsOrMethod === 'object') {
    method = optionsOrMethod.method ?? 'GET';
    _body = optionsOrMethod.body ?? null;
    _retries = optionsOrMethod.retries ?? 3;
    _accountIdx = optionsOrMethod.accountIdx ?? _accountIdx;
    _extraHeaders = optionsOrMethod.extraHeaders;
  }

  for (let attempt = 0; attempt <= _retries; attempt++) {
    try {
      // Always use the latest token from the accounts array if we have an index
      let currentToken = token;
      if (_accountIdx !== null && _accounts[_accountIdx]) {
        currentToken = _accounts[_accountIdx].accessToken;
      }

      const resp = await makeRequest(endpoint, currentToken, method, _body, _extraHeaders);

      if (resp.status === 204) return null;

      if (resp.status === 429) {
        // Graph tells us exactly how long to wait via Retry-After (seconds);
        // honour it when present. The old blind 15s→30s→60s→60s ladder ignored
        // that header and could park a SINGLE request for up to 165s. Because
        // both pollers fire on a fixed interval (20s / 30s), rounds then
        // overlapped and piled up — each new round adding requests that drew
        // more 429s, which deepened the backoff further. Capped at 60s so a
        // hostile/absurd Retry-After can't stall a request indefinitely.
        const retryAfterRaw = resp.headers.get('Retry-After');
        const retryAfterSecs = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;
        const waitTime = Number.isFinite(retryAfterSecs) && retryAfterSecs >= 0
          ? Math.min(retryAfterSecs * 1_000, 60_000)
          : Math.min(2_000 * Math.pow(2, attempt), 30_000);
        console.log(`[graph] Rate limited, waiting ${waitTime / 1000}s (attempt ${attempt + 1})`);
        await new Promise((r) => setTimeout(r, waitTime));
        continue;
      }

      if (resp.status === 401) {
        // Try to refresh token if we have an account index and a refresh token
        if (_accountIdx !== null && _accounts[_accountIdx]?.refreshToken) {
          console.log('[graph] Token expired, attempting refresh...');
          try {
            await refreshTokenOnce(_accountIdx, _accounts);
            const newToken = _accounts[_accountIdx].accessToken;
            const retryResp = await makeRequest(endpoint, newToken, method, _body, _extraHeaders);
            if (retryResp.status === 204) return null;
            if (retryResp.ok) return parseResponse(retryResp);
            let retryErrBody = '';
            try { retryErrBody = await retryResp.text(); } catch (_) { /* ignore */ }
            let retryErrMsg = retryErrBody;
            try {
              const j = JSON.parse(retryErrBody) as { error?: { message?: string; code?: string } };
              retryErrMsg = j?.error?.message || j?.error?.code || retryErrBody;
            } catch (_) { /* ignore */ }
            throw new Error(`API error ${retryResp.status} after refresh: ${retryErrMsg.substring(0, 200)}`);
          } catch (refreshErr) {
            console.error('[graph] Token refresh failed:', refreshErr);
            throw new Error('Token expired - refresh failed');
          }
        }
        throw new Error('Token expired');
      }

      if (!resp.ok) {
        let errBody = '';
        try { errBody = await resp.text(); } catch (_) { /* ignore */ }
        let errMsg = errBody;
        try {
          const j = JSON.parse(errBody) as { error?: { message?: string; code?: string } };
          errMsg = j?.error?.message || j?.error?.code || errBody;
        } catch (_) { /* ignore */ }
        throw new Error(`API error ${resp.status}: ${errMsg.substring(0, 200)}`);
      }

      return parseResponse(resp);
    } catch (e) {
      const err = e as Error;
      if (attempt === _retries || err.message.includes('Token expired')) throw e;
      console.log(`[graph] Error, retrying (${attempt + 1}/${_retries}):`, err.message);
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
  throw new Error('Max retries exceeded');
}
