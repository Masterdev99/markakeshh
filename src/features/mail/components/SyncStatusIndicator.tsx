/**
 * Sync status pill — isolated into its own component (rather than living as
 * state on MailView) so its per-second updates don't cascade into a
 * re-render of the entire mail view.
 *
 * It used to be MailView's own state: a 15s ticker to refresh the "Synced Xm
 * ago" label, plus useLiveSync's onSyncTick calling setState on every poll.
 * Since MailView owns the folder sidebar, message list, and reading pane as
 * children, every one of those ticks re-rendered that entire subtree even
 * though none of their actual data had changed — which, alongside being
 * wasteful, is exactly the kind of unprompted, wide-reaching DOM churn that
 * makes the browser's built-in page translation revert to the original
 * language: translation rewrites text nodes in place, and a React
 * reconciliation pass it didn't cause can stomp those rewrites back to the
 * app's own (untranslated) output. Isolating this ticking to a small leaf
 * component means only this pill's own DOM node is touched, not the message
 * list or reading pane.
 *
 * The action-in-progress override text (set by MailView's Load All / Export
 * / Backup / Save DB / Load DB / Sweep handlers) lives in the shared
 * useActionStatusStore rather than local state here, because it's also
 * shown a second time at the far right of the toolbar those actions live in
 * — see ToolbarActionStatus below.
 */
import { useEffect, useState } from 'react';
import { useLiveSync } from '../hooks/useLiveSync';
import { useActionStatusStore } from '../../../store/actionStatus';
import { getMailSyncIntervalSeconds } from '../../../services/storage/syncSettings';
import type { Account, Message } from '../../../types';

interface SyncStatusIndicatorProps {
  account: Account | null;
  accountIdx: number;
  currentFolderId: string;
  allFolders: Array<{ id: string; displayName: string }>;
  isActive: boolean;
  onNewMessages: (msgs: Message[]) => void;
  /** Fired once when the initial seed fetch succeeds — see useLiveSync's onFirstSync doc comment. */
  onFirstSync?: () => void;
}

/** "Synced now" right after a tick, then a live per-second countdown to the next one. */
function getSyncLabel(syncState: 'checking' | 'synced' | 'error', lastSyncedAt: Date | null, intervalSeconds: number, nowMs: number): string {
  if (syncState === 'error') return 'Sync error — retrying';
  if (!lastSyncedAt) return 'Live sync active';
  const elapsedSecs = Math.floor((nowMs - lastSyncedAt.getTime()) / 1000);
  if (elapsedSecs < 2) return 'Synced now';
  const remaining = Math.max(0, intervalSeconds - elapsedSecs);
  return `Next sync in ${remaining}s`;
}

export function SyncStatusIndicator({ account, accountIdx, currentFolderId, allFolders, isActive, onNewMessages, onFirstSync }: SyncStatusIndicatorProps) {
  const [syncState, setSyncState] = useState<'checking' | 'synced' | 'error'>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const statusOverride = useActionStatusStore((s) => s.text);
  const [intervalSeconds, setIntervalSecondsState] = useState(getMailSyncIntervalSeconds);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Drives the "Next sync in Ns" countdown — a 1s tick touching only this
  // small leaf component, not the rest of the mail view (see file doc comment).
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = () => setIntervalSecondsState(getMailSyncIntervalSeconds());
    window.addEventListener('outlook:mail-sync-interval-changed', handler);
    return () => window.removeEventListener('outlook:mail-sync-interval-changed', handler);
  }, []);

  useLiveSync({
    account,
    accountIdx,
    currentFolderId,
    allFolders,
    enabled: isActive,
    onNewMessages,
    onFirstSync,
    onSyncTick: (state) => {
      setSyncState(state);
      if (state === 'synced') setLastSyncedAt(new Date());
    },
  });

  return (
    <div className="sync-indicator" id="syncStatus" style={{ paddingRight: 0 }} title={lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString()}` : undefined}>
      {/* The dot spins during a "checking" tick, but the label always
          shows the countdown/refreshed state rather than flashing to a
          "Syncing…" processing state on every poll. */}
      <div className={`dot${statusOverride || syncState === 'checking' ? ' spinning' : syncState === 'error' ? ' error' : ''}`} />
      {statusOverride ?? getSyncLabel(syncState, lastSyncedAt, intervalSeconds, nowMs)}
    </div>
  );
}

/** The same action-in-progress text, shown a second time at the far right of the toolbar the triggering buttons live in — hidden entirely when no action is running. */
export function ToolbarActionStatus() {
  const text = useActionStatusStore((s) => s.text);
  if (!text) return null;
  return (
    <div className="toolbar-action-status">
      <div className="dot spinning" />
      {text}
    </div>
  );
}
