/**
 * Live sync hook — polls the viewed account/folder for new messages so the
 * UI can show a "new mail" toast and refresh. Ported from checkNewMessages()
 * at lines 12162–12280.
 *
 * Local-rule matching/actions (move/delete/markAsRead/Telegram notify) used
 * to also run from here, but that only ever covered whichever account was
 * currently selected — an account with a live Telegram rule went unpolled
 * the moment you switched away from it. That responsibility now lives in
 * backgroundRuleSync.ts, started once at the App shell level for every
 * account with an active Telegram rule, independent of what's on screen.
 * This hook stays purely about the visible account's UI refresh.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLatestMessages } from '../../../services/graph/messages';
import { getMailSyncIntervalSeconds } from '../../../services/storage/syncSettings';
import type { Account, Message } from '../../../types';

interface LiveSyncOptions {
  account: Account | null;
  accountIdx: number;
  currentFolderId: string;
  onNewMessages: (msgs: Message[]) => void;
  /** Fired on every sync tick (not just when new mail arrives) so the UI can show a live "checking / synced / error" state instead of a static label. */
  onSyncTick?: (state: 'checking' | 'synced' | 'error') => void;
  /** Fired once, the first time the initial seed fetch succeeds for this account/folder — mirrors checkNewMessages()'s "messages.length === 0" first-load branch in New-mailbox.html, which re-fetches the folder tree at that point too (not just when new mail later arrives). Gives an account whose *initial* folder fetch happened to flake out a second chance right away instead of waiting for mail activity or a manual retry. */
  onFirstSync?: () => void;
  enabled?: boolean;
}

export function useLiveSync({ account, accountIdx, currentFolderId, onNewMessages, onSyncTick, onFirstSync, enabled = true }: LiveSyncOptions) {
  const seenIdsRef = useRef<Set<string>>(new Set());

  // Latest callback refs, read inside the polling logic without being
  // callback/effect dependencies. MailView passes onNewMessages/onSyncTick
  // as new inline functions on every render — if those flowed into
  // checkNewMessages/seedSeenIds' dependency arrays (as they used to), each
  // parent re-render would rebuild the polling effects and re-run
  // seedSeenIds. Since onSyncTick itself calls setSyncState (a re-render-
  // causing state update), that closed a feedback loop: tick → re-render →
  // rebuild → seed fetch → tick → re-render → ..., firing requests as fast
  // as the network would allow and tripping net::ERR_INSUFFICIENT_RESOURCES.
  const onNewMessagesRef = useRef(onNewMessages);
  onNewMessagesRef.current = onNewMessages;
  const onSyncTickRef = useRef(onSyncTick);
  onSyncTickRef.current = onSyncTick;
  const onFirstSyncRef = useRef(onFirstSync);
  onFirstSyncRef.current = onFirstSync;

  // Guards against overlapping polls. A single fetch can sit in a 429
  // back-off for far longer than the poll interval, and setInterval doesn't
  // wait — it just starts another one on top. Those extra in-flight requests
  // draw more throttling, which makes each poll slower still, so the pile-up
  // feeds itself until the tab is saturated. Skipping a tick costs nothing:
  // the next is seconds away and seenIds means no message is missed.
  const inFlightRef = useRef(false);

  const checkNewMessages = useCallback(async () => {
    if (!account || inFlightRef.current) return;
    inFlightRef.current = true;
    onSyncTickRef.current?.('checking');
    try {
      const latest = await fetchLatestMessages(currentFolderId, account.accessToken, accountIdx, 10);
      const newMsgs = latest.filter((m) => !seenIdsRef.current.has(m.id));
      newMsgs.forEach((m) => seenIdsRef.current.add(m.id));
      if (newMsgs.length > 0) {
        onNewMessagesRef.current(newMsgs);
      }
      onSyncTickRef.current?.('synced');
    } catch (_e) {
      // Silently ignore sync errors — they'll be visible via error toasts if severe
      onSyncTickRef.current?.('error');
    } finally {
      inFlightRef.current = false;
    }
  }, [account, accountIdx, currentFolderId]);

  // Seed initial seen IDs on mount / account change
  const seedSeenIds = useCallback(async () => {
    if (!account) return;
    onSyncTickRef.current?.('checking');
    try {
      const msgs = await fetchLatestMessages(currentFolderId, account.accessToken, accountIdx, 10);
      msgs.forEach((m) => seenIdsRef.current.add(m.id));
      onSyncTickRef.current?.('synced');
      onFirstSyncRef.current?.();
    } catch (_e) {
      onSyncTickRef.current?.('error');
    }
  }, [account, accountIdx, currentFolderId]);

  useEffect(() => {
    if (!enabled) return;
    seenIdsRef.current.clear();
    seedSeenIds();
  }, [seedSeenIds, enabled]);

  // User-configurable poll cadence (Settings → Mail → Refresh interval).
  // Re-read on the change event so an update takes effect immediately
  // instead of requiring a reload.
  const [intervalSeconds, setIntervalSeconds] = useState(getMailSyncIntervalSeconds);
  useEffect(() => {
    const handler = () => setIntervalSeconds(getMailSyncIntervalSeconds());
    window.addEventListener('outlook:mail-sync-interval-changed', handler);
    return () => window.removeEventListener('outlook:mail-sync-interval-changed', handler);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(checkNewMessages, intervalSeconds * 1_000);
    return () => clearInterval(id);
  }, [checkNewMessages, enabled, intervalSeconds]);

  return { checkNewMessages };
}
