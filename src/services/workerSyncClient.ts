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

export interface WorkerStatus {
  lastRun: string | null;
  lastError: string | null;
  accountCount: number;
}

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
  return { lastRun: data.lastRun ?? null, lastError: data.lastError ?? null, accountCount: data.accountCount ?? 0 };
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
