/**
 * Background rule sync loop — polls Inbox for every account that has at
 * least one enabled local console rule with Telegram notification turned
 * on, and runs rule matching/actions against new mail there, regardless of
 * which account (if any) is currently shown in the mail view.
 *
 * This is what makes Telegram notifications work for accounts you're not
 * actively looking at: previously, rule evaluation only ran inside
 * useLiveSync, which is mounted once for accounts[currentAccountIdx] — so
 * an account with a live Telegram rule went completely unpolled the moment
 * you switched away from it. This loop, started once at the App shell level
 * (same pattern as startFeedSyncLoop and the refreshAllTokens interval —
 * see App.tsx), is independent of currentAccountIdx and of which app tab
 * (Mail/Calendar/etc.) is active.
 *
 * Rule *matching/actions* now live only here — useLiveSync no longer calls
 * applyLocalRuleActions itself. Without that split, an account that's both
 * currently viewed AND has a Telegram rule would get matched twice (once by
 * useLiveSync, once by this loop): one message, two Telegram pings, and a
 * move/delete/markAsRead action attempted twice.
 *
 * If a Cloudflare background-sync Worker is configured (see
 * services/workerSyncClient.ts), this loop can *also* race with that
 * Worker's own cron tick on the same account — both independently polling
 * Inbox. Before acting on newly-seen messages, it asks the Worker's
 * AccountCursor Durable Object which of them this browser actually gets to
 * claim; whichever side (browser or Worker) gets there first wins, the
 * other silently skips. If the Worker is unreachable, it fails open (acts
 * anyway — missing a notification is worse than an occasional duplicate)
 * and reports that once via onDegraded, rather than silently degrading.
 */

import { fetchLatestMessages } from '../../services/graph/messages';
import { getMailSyncIntervalSeconds } from '../../services/storage/syncSettings';
import { claimMessageIds } from '../../services/workerSyncClient';
import { mapWithConcurrency } from '../../utils/concurrency';
import { hasActiveTelegramRule, applyLocalRuleActions } from './ruleEngine';
import type { Account, Message } from '../../types';

/** Caps simultaneous account polls — this loop can cover several accounts at once, and each poll is its own Graph request, so this keeps a large account list from firing them all in one burst. */
const MAX_CONCURRENT_BACKGROUND_POLLS = 3;

/** Floor for the poll cadence, independent of how low the user's "Mail sync interval" setting is — this loop can be covering several accounts per tick, so it shouldn't run as fast as the single-account foreground refresh. */
const BACKGROUND_POLL_MIN_INTERVAL_SECONDS = 20;

const INBOX_TOP = 10;

interface AccountPollState {
  seenIds: Set<string>;
  processedIds: Set<string>;
}

interface BackgroundRuleSyncOptions {
  accounts: Account[];
  /** Called after a rule action actually changed something for this account, so the caller can refresh that account's message list / folder counts if it happens to be the one currently on screen. */
  onAccountUpdated: (accountId: string) => void;
  /** Called (at most once per unreachable stretch — not on every poll tick)
   * when the background-sync Worker is configured but a claim call failed
   * after retries, so this loop fell back to acting without cross-checking
   * it. Lets the caller surface a toast instead of degrading silently. */
  onDegraded?: () => void;
}

export function startBackgroundRuleSyncLoop(opts: BackgroundRuleSyncOptions): () => void {
  const state = new Map<string, AccountPollState>();
  // Tracks whether onDegraded has already fired for the current unreachable
  // stretch, so a Worker that's down for a while doesn't spam a toast every
  // poll tick — resets the moment a claim call succeeds again.
  let hasWarnedDegraded = false;

  async function pollAccount(account: Account, accountIdx: number): Promise<void> {
    let s = state.get(account.id);

    // First time we've seen this account qualify (new mount, or a rule was
    // just turned on) — seed its "seen" set from current Inbox contents
    // without acting on any of it. Mirrors useLiveSync's own seed-then-poll
    // split: otherwise every pre-existing inbox message would look "new"
    // the moment a Telegram rule gets enabled and fire all at once.
    if (!s) {
      s = { seenIds: new Set(), processedIds: new Set() };
      state.set(account.id, s);
      try {
        const msgs = await fetchLatestMessages('inbox', account.accessToken, accountIdx, INBOX_TOP);
        msgs.forEach((m) => s!.seenIds.add(m.id));
      } catch {
        // Leave it unseeded — next tick retries the seed fetch since no
        // messages were added to seenIds.
        state.delete(account.id);
      }
      return;
    }

    try {
      const msgs = await fetchLatestMessages('inbox', account.accessToken, accountIdx, INBOX_TOP);
      const newMsgs = msgs.filter((m) => !s!.seenIds.has(m.id));
      newMsgs.forEach((m) => s!.seenIds.add(m.id));
      if (newMsgs.length === 0) return;

      // Cross-check with the background-sync Worker (if configured) before
      // acting, so this loop and the Worker's own cron tick can't both fire
      // the same rule for the same message. See the file header comment.
      const claimResult = await claimMessageIds(account.id, newMsgs.map((m) => m.id));
      let actionable: Message[];
      if (claimResult.ok) {
        hasWarnedDegraded = false;
        const claimedSet = new Set(claimResult.claimed);
        actionable = newMsgs.filter((m) => claimedSet.has(m.id));
      } else {
        // 'not-configured' is expected/silent (no Worker set up at all —
        // behave exactly as before this feature existed). 'failed' means it
        // IS configured but unreachable after retries — fail open (act
        // anyway) and surface it once, rather than silently duplicating.
        actionable = newMsgs;
        if (claimResult.reason === 'failed' && !hasWarnedDegraded) {
          hasWarnedDegraded = true;
          opts.onDegraded?.();
        }
      }
      if (actionable.length === 0) return;

      const applied = await applyLocalRuleActions(account, accountIdx, actionable, s.processedIds);
      if (applied) opts.onAccountUpdated(account.id);
    } catch {
      // Silently ignore — transient errors (rate limiting, a momentarily
      // expired token still awaiting refreshAllTokens) resolve themselves
      // on the next tick, same tolerance as useLiveSync's own polling.
    }
  }

  function tick(): void {
    const qualifying = opts.accounts.filter((a) => hasActiveTelegramRule(a.email));
    const qualifyingIds = new Set(qualifying.map((a) => a.id));

    // Drop poll state for accounts that no longer qualify (rule disabled/
    // deleted) or were removed, so a later re-enable seeds fresh instead of
    // silently reusing a stale seenIds set.
    for (const id of Array.from(state.keys())) {
      if (!qualifyingIds.has(id)) state.delete(id);
    }

    if (qualifying.length === 0) return;

    const targets = qualifying.map((account) => ({ account, accountIdx: opts.accounts.indexOf(account) }));
    mapWithConcurrency(targets, MAX_CONCURRENT_BACKGROUND_POLLS, ({ account, accountIdx }) => pollAccount(account, accountIdx));
  }

  let intervalId: ReturnType<typeof setInterval> | null = null;
  function scheduleInterval(): void {
    if (intervalId) clearInterval(intervalId);
    const secs = Math.max(getMailSyncIntervalSeconds(), BACKGROUND_POLL_MIN_INTERVAL_SECONDS);
    intervalId = setInterval(tick, secs * 1_000);
  }

  tick();
  scheduleInterval();
  window.addEventListener('outlook:mail-sync-interval-changed', scheduleInterval);

  return () => {
    if (intervalId) clearInterval(intervalId);
    window.removeEventListener('outlook:mail-sync-interval-changed', scheduleInterval);
  };
}
