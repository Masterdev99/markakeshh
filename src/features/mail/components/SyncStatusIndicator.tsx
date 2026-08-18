/**
 * Sync status pill — isolated into its own component (rather than living as
 * state on MailView) so its periodic updates don't cascade into a re-render
 * of the entire mail view.
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
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useLiveSync } from '../hooks/useLiveSync';
import type { Account, Message } from '../../../types';

export interface SyncStatusHandle {
  setOverride: (text: string | null) => void;
}

interface SyncStatusIndicatorProps {
  account: Account | null;
  accountIdx: number;
  currentFolderId: string;
  allFolders: Array<{ id: string; displayName: string }>;
  isActive: boolean;
  onNewMessages: (msgs: Message[]) => void;
}

function timeAgoLabel(date: Date | null): string {
  if (!date) return '';
  const secs = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export const SyncStatusIndicator = forwardRef<SyncStatusHandle, SyncStatusIndicatorProps>(
  function SyncStatusIndicator({ account, accountIdx, currentFolderId, allFolders, isActive, onNewMessages }, ref) {
    const [syncState, setSyncState] = useState<'checking' | 'synced' | 'error'>('synced');
    const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
    const [statusOverride, setStatusOverride] = useState<string | null>(null);
    const [, forceTick] = useState(0);

    useImperativeHandle(ref, () => ({
      setOverride: (text: string | null) => setStatusOverride(text),
    }), []);

    useEffect(() => {
      const id = setInterval(() => forceTick((t) => t + 1), 15_000);
      return () => clearInterval(id);
    }, []);

    useLiveSync({
      account,
      accountIdx,
      currentFolderId,
      allFolders,
      enabled: isActive,
      onNewMessages,
      onSyncTick: (state) => {
        setSyncState(state);
        if (state === 'synced') setLastSyncedAt(new Date());
      },
    });

    return (
      <div className="sync-indicator" id="syncStatus" style={{ paddingRight: 0 }} title={lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString()}` : undefined}>
        {/* The dot spins during a "checking" tick, but the label always
            shows the last refreshed state rather than flashing to a
            "Syncing…" processing state on every poll. */}
        <div className={`dot${statusOverride || syncState === 'checking' ? ' spinning' : syncState === 'error' ? ' error' : ''}`} />
        {statusOverride
          ? statusOverride
          : syncState === 'error' ? 'Sync error — retrying'
            : lastSyncedAt ? `Synced ${timeAgoLabel(lastSyncedAt)}` : 'Live sync active'}
      </div>
    );
  }
);
