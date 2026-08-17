/**
 * Feed / auto-import sync loop.
 * Ported from startFeedSync() / fetchFeed() at lines 7890–7997.
 */

import type { Account } from '../../types';
import { getFeedUrl, getFeedIntervalSeconds } from '../../services/storage/feed';
import { saveAccounts } from '../../services/storage/accounts';

interface FeedSyncOptions {
  accounts: Account[];
  currentAccountIdx: number;
  onNewAccounts: () => void;
}

async function fetchFeed(url: string, accounts: Account[], onNewAccounts: () => void): Promise<void> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 15_000);
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) { console.warn('[feed] Feed error:', resp.status); return; }

    const data = await resp.json() as { accounts?: Array<{
      id?: string; accessToken?: string; refreshToken?: string;
      email?: string; displayName?: string; capturedAt?: string;
    }> };
    if (!Array.isArray(data.accounts)) return;

    let newCount = 0;

    for (const feedAcc of data.accounts) {
      const exists = accounts.some(
        (a) => a.feedId === feedAcc.id || (a.email && feedAcc.email && a.email.toLowerCase() === feedAcc.email?.toLowerCase())
      );

      if (exists) {
        const idx = accounts.findIndex(
          (a) => a.feedId === feedAcc.id || (a.email && feedAcc.email && a.email.toLowerCase() === feedAcc.email?.toLowerCase())
        );
        if (idx >= 0 && feedAcc.accessToken) {
          accounts[idx].accessToken = feedAcc.accessToken;
          if (feedAcc.refreshToken) accounts[idx].refreshToken = feedAcc.refreshToken;
          accounts[idx].lastFeedSync = new Date().toISOString();
        }
        continue;
      }

      if (!feedAcc.accessToken) continue;

      accounts.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        feedId: feedAcc.id ?? null,
        accessToken: feedAcc.accessToken,
        refreshToken: feedAcc.refreshToken ?? null,
        email: feedAcc.email ?? 'Unknown',
        displayName: feedAcc.displayName ?? feedAcc.email ?? 'Account',
        label: null,
        addedAt: feedAcc.capturedAt ?? new Date().toISOString(),
        lastFeedSync: new Date().toISOString(),
        autoImported: true,
        unreadCount: 0,
      });
      newCount++;
    }

    if (newCount > 0 || data.accounts.length > 0) {
      saveAccounts(accounts);
    }

    if (newCount > 0) onNewAccounts();
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      console.warn('[feed] fetchFeed error:', (e as Error).message);
    }
  }
}

export function startFeedSyncLoop(opts: FeedSyncOptions): () => void {
  const url = getFeedUrl();
  if (!url) return () => {};

  const intervalSecs = getFeedIntervalSeconds();

  // Fetch immediately
  fetchFeed(url, opts.accounts, opts.onNewAccounts);

  const id = setInterval(() => {
    fetchFeed(url, opts.accounts, opts.onNewAccounts);
  }, intervalSecs * 1_000);

  console.log('[feed] Auto-sync started, interval:', intervalSecs, 's');
  return () => clearInterval(id);
}
