/**
 * Talks to the optional Cloudflare Worker (see /cloudflare-worker) that runs
 * local console rules headlessly. Pushes accounts/rules/Telegram settings to
 * it and reads back its last-run status. Distinct from services/storage/
 * workerSync.ts, which only holds the Worker's URL/secret — this module does
 * the actual network calls.
 */
import { loadAccounts } from './storage/accounts';
import { loadLocalConsoleRules } from './storage/rules';
import { getTelegramSettings } from './storage/smtp';
import { getWorkerSyncSecret, getWorkerSyncUrl } from './storage/workerSync';

export interface WorkerSyncAccount {
  id: string;
  email: string;
  refreshToken: string;
  clientId?: string;
  tenantId?: string;
  label?: string | null;
  displayName?: string;
}

export interface WorkerSyncPayload {
  accounts: WorkerSyncAccount[];
  rulesByEmail: Record<string, ReturnType<typeof loadLocalConsoleRules>>;
  telegram: ReturnType<typeof getTelegramSettings>;
}

export interface WorkerAccountCursorStatus {
  id: string;
  email: string;
  cursor: { seeded: boolean; cursorSize: number; lastClaim: { source: 'browser' | 'worker'; claimed: string[]; at: string } | null } | null;
}

export interface WorkerStatus {
  lastRun: string | null;
  lastError: string | null;
  accountCount: number;
  accounts?: WorkerAccountCursorStatus[];
}

export type ClaimResult =
  | { ok: true; claimed: string[] }
  | { ok: false; reason: 'not-configured' | 'failed' };

/** Only the fields the Worker needs — deliberately excludes accessToken
 * (short-lived; the Worker mints and caches its own from the refresh token). */
export function buildSyncPayload(): WorkerSyncPayload {
  const accounts = loadAccounts().filter((a) => a.refreshToken);
  const rulesByEmail: WorkerSyncPayload['rulesByEmail'] = {};
  for (const a of accounts) rulesByEmail[a.email] = loadLocalConsoleRules(a.email);

  return {
    accounts: accounts.map((a) => ({
      id: a.id,
      email: a.email,
      refreshToken: a.refreshToken as string,
      clientId: a.clientId,
      tenantId: a.tenantId,
      label: a.label,
      displayName: a.displayName,
    })),
    rulesByEmail,
    telegram: getTelegramSettings(),
  };
}

function requireConfig(): { url: string; secret: string } {
  const url = getWorkerSyncUrl();
  const secret = getWorkerSyncSecret();
  if (!url || !secret) throw new Error('Worker URL and secret must be set first');
  return { url: url.replace(/\/+$/, ''), secret };
}

export async function syncToWorker(): Promise<{ accountCount: number }> {
  const { url, secret } = requireConfig();
  const resp = await fetch(`${url}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify(buildSyncPayload()),
  });
  const data = (await resp.json().catch(() => ({}))) as { accountCount?: number; error?: string };
  if (!resp.ok) throw new Error(data.error || `Sync failed (${resp.status})`);
  return { accountCount: data.accountCount ?? 0 };
}

export async function fetchWorkerStatus(): Promise<WorkerStatus> {
  const { url, secret } = requireConfig();
  const resp = await fetch(`${url}/status`, { headers: { Authorization: `Bearer ${secret}` } });
  const data = (await resp.json().catch(() => ({}))) as Partial<WorkerStatus> & { error?: string };
  if (!resp.ok) throw new Error(data.error || `Status check failed (${resp.status})`);
  return { lastRun: data.lastRun ?? null, lastError: data.lastError ?? null, accountCount: data.accountCount ?? 0, accounts: data.accounts };
}

const CLAIM_RETRY_DELAYS_MS = [200, 500, 1000];

/**
 * Asks the Worker's AccountCursor Durable Object which of these message IDs
 * this browser actually gets to act on — the same atomic claim the Worker's
 * own cron tick uses, so whichever side gets there first wins and the other
 * silently skips, instead of both firing a rule action for the same message.
 *
 * Retries a few times on failure before giving up, since a transient blip is
 * far more likely than real downtime. If the Worker isn't configured at all,
 * returns 'not-configured' immediately — that's an expected, silent case,
 * not a failure. If it's configured but unreachable after retries, returns
 * 'failed' — the caller should fall back to acting unfiltered (missing a
 * notification is worse than an occasional duplicate) and surface that this
 * happened, rather than silently degrading.
 */
export async function claimMessageIds(accountId: string, messageIds: string[]): Promise<ClaimResult> {
  const url = getWorkerSyncUrl();
  const secret = getWorkerSyncSecret();
  if (!url || !secret) return { ok: false, reason: 'not-configured' };
  if (messageIds.length === 0) return { ok: true, claimed: [] };

  const endpoint = `${url.replace(/\/+$/, '')}/claim`;
  for (let attempt = 0; attempt <= CLAIM_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ accountId, messageIds }),
      });
      if (!resp.ok) throw new Error(`Claim failed (${resp.status})`);
      const data = (await resp.json()) as { claimed: string[] };
      return { ok: true, claimed: data.claimed };
    } catch {
      if (attempt < CLAIM_RETRY_DELAYS_MS.length) {
        await new Promise((resolve) => setTimeout(resolve, CLAIM_RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  return { ok: false, reason: 'failed' };
}

/** Best-effort sync — used for the fire-and-forget call on app load. Never
 * throws; silently no-ops if the Worker isn't configured yet. */
export async function syncToWorkerBestEffort(): Promise<void> {
  if (!getWorkerSyncUrl() || !getWorkerSyncSecret()) return;
  try {
    await syncToWorker();
  } catch {
    // Best-effort — surfaced properly next time the user opens the Settings panel.
  }
}
