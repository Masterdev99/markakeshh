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
 * This pill shows ONLY sync info (never the Load All / Export / Backup /
 * Save DB / Load DB / Sweep action-in-progress text) — that text lives
 * entirely in ToolbarActionStatus, on the far right of the toolbar those
 * actions live in. They used to share one line, which meant an unrelated
 * export made the sync pill lie about what it was actually doing.
 */
import { useEffect, useState } from 'react';
import { useLiveSync } from '../hooks/useLiveSync';
import { useActionStatusStore } from '../../../store/actionStatus';
import type { Account, Message } from '../../../types';

interface SyncStatusIndicatorProps {
  account: Account | null;
  accountIdx: number;
  currentFolderId: string;
  isActive: boolean;
  onNewMessages: (msgs: Message[]) => void;
  /** Fired once when the initial seed fetch succeeds — see useLiveSync's onFirstSync doc comment. */
  onFirstSync?: () => void;
}

/**
 * "Synced now" right after a tick, then a live per-second count-up of seconds
 * since.
 *
 * Returned in three parts rather than as one interpolated string so the only
 * piece that actually changesevery second — the elapsed count — can be isolated
 * in its own `translate="no"` node. See the render for why that matters.
 */
function getSyncLabel(
  syncState: 'checking' | 'synced' | 'error',
  lastSyncedAt: Date | null,
  nowMs: number
): { prefix: string; elapsed: string | null; suffix: string } {
  if (syncState === 'error') return { prefix: 'Sync error — retrying', elapsed: null, suffix: '' };
  if (!lastSyncedAt) return { prefix: 'Live sync active', elapsed: null, suffix: '' };
  const elapsedSecs = Math.floor((nowMs - lastSyncedAt.getTime()) / 1000);
  if (elapsedSecs < 2) return { prefix: 'Synced now', elapsed: null, suffix: '' };
  return { prefix: 'Last synced', elapsed: `${elapsedSecs}s`, suffix: 'ago' };
}

export function SyncStatusIndicator({ account, accountIdx, currentFolderId, isActive, onNewMessages, onFirstSync }: SyncStatusIndicatorProps) {
  const [syncState, setSyncState] = useState<'checking' | 'synced' | 'error'>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Drives the "Last synced Ns ago" count-up — a 1s tick touching only this
  // small leaf component, not the rest of the mail view (see file doc comment).
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  useLiveSync({
    account,
    accountIdx,
    currentFolderId,
    enabled: isActive,
    onNewMessages,
    onFirstSync,
    onSyncTick: (state) => {
      setSyncState(state);
      if (state === 'synced') setLastSyncedAt(new Date());
    },
  });

  const label = getSyncLabel(syncState, lastSyncedAt, nowMs);

  return (
    <div className="sync-indicator" id="syncStatus" style={{ paddingRight: 0 }} title={lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString()}` : undefined}>
      {/* The dot spins during a "checking" tick, but the label always
          shows the count-up/refreshed state rather than flashing to a
          "Syncing…" processing state on every poll. */}
      <div className={`dot${syncState === 'checking' ? ' spinning' : syncState === 'error' ? ' error' : ''}`} />
      {/* This pill is the app's only unending DOM mutation: the count-up
          rewrites a text node once a second for as long as the tab is open.
          Rendered as one interpolated string, that node is re-translated by
          the browser's page translation every single second, and the constant
          churn is what made a translated page snap back to English. Splitting
          the volatile number into its own `translate="no"` node leaves the
          surrounding words as static text the translator handles once and
          never revisits. */}
      <span>{label.prefix}</span>
      {label.elapsed !== null && (
        <>
          {' '}
          <span translate="no" className="notranslate">{label.elapsed}</span>{' '}
          <span>{label.suffix}</span>
        </>
      )}
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
