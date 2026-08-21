/**
 * Settings menu — opened from the header gear icon next to the avatar.
 * Consolidates cross-cutting preferences that don't belong to one feature
 * panel: search refinement visibility and Telegram notification settings
 * (previously buried inside the Rules manager).
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchStore } from '../store/search';
import { useAccountsStore } from '../store/accounts';
import { TelegramSettings } from '../features/smtp-forwarding/TelegramSettings';
import { FeedSyncSettings } from '../features/feed/FeedSyncSettings';
import { CloudflareWorkerSettings } from '../features/worker-sync/CloudflareWorkerSettings';
import { loadFeedSettings } from '../services/storage/feed';
import { getMailSyncIntervalSeconds, setMailSyncIntervalSeconds } from '../services/storage/syncSettings';
import { getWorkerSyncSecret, getWorkerSyncUrl } from '../services/storage/workerSync';
import { exportAccountTokens } from '../services/export';
import { useToast } from '../app/providers/ToastProvider';
import { FilterIcon, ChatIcon, ChevronRightIcon, PlugConnectedIcon, ArrowSyncIcon, ArrowDownloadIcon, CloudIcon } from './icons';

const MAIL_SYNC_INTERVAL_OPTIONS = [
  { value: 15, label: 'Every 15 seconds' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every 1 minute' },
  { value: 120, label: 'Every 2 minutes' },
  { value: 300, label: 'Every 5 minutes' },
];

interface SettingsMenuProps {
  onClose: () => void;
}

export function SettingsMenu({ onClose }: SettingsMenuProps) {
  const search = useSearchStore();
  const { accounts, currentAccountIdx } = useAccountsStore();
  const { toast } = useToast();
  const [showTelegram, setShowTelegram] = useState(false);
  const [showFeedSync, setShowFeedSync] = useState(false);
  const [showWorkerSync, setShowWorkerSync] = useState(false);
  const workerSyncConfigured = !!(getWorkerSyncUrl() && getWorkerSyncSecret());
  const [syncInterval, setSyncInterval] = useState(getMailSyncIntervalSeconds);
  const feedConnected = !!loadFeedSettings();
  const ref = useRef<HTMLDivElement>(null);
  const currentAccount = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;

  function handleDownloadTokens() {
    if (!currentAccount) { toast('Select an account first', 'error'); return; }
    exportAccountTokens(currentAccount);
    toast('Token file downloaded', 'success');
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <>
      <div className="settings-menu" ref={ref}>
        <div className="settings-menu-title">Settings</div>

        <div className="settings-menu-section-label">Search</div>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => search.toggleFilterBar()}
        >
          <FilterIcon size={18} className="settings-menu-item-icon" />
          <span className="settings-menu-item-label">
            <span>Search filters</span>
            <span className="settings-menu-item-hint">Refine results by attachment, read state, and more</span>
          </span>
          <span className={`settings-menu-switch${search.showFilterBar ? ' on' : ''}`} aria-hidden="true">
            <span className="settings-menu-switch-dot" />
          </span>
        </button>

        <div className="settings-menu-section-label">Mail</div>
        <div className="settings-menu-item settings-menu-item-static">
          <ArrowSyncIcon size={18} className="settings-menu-item-icon" />
          <span className="settings-menu-item-label">
            <span>Refresh interval</span>
            <span className="settings-menu-item-hint">How often the app checks for new mail</span>
          </span>
          <select
            className="settings-menu-item-select"
            value={syncInterval}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSyncInterval(v);
              setMailSyncIntervalSeconds(v);
            }}
          >
            {MAIL_SYNC_INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="settings-menu-section-label">Notifications</div>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => { setShowTelegram(true); }}
        >
          <ChatIcon size={18} className="settings-menu-item-icon" />
          <span className="settings-menu-item-label">
            <span>Telegram notifications</span>
            <span className="settings-menu-item-hint">Bot &amp; chat ID for rule-matched mail alerts</span>
          </span>
          <ChevronRightIcon size={16} className="settings-menu-item-chevron" />
        </button>

        <button
          type="button"
          className="settings-menu-item"
          onClick={() => { setShowWorkerSync(true); }}
        >
          <CloudIcon size={18} className="settings-menu-item-icon" />
          <span className="settings-menu-item-label">
            <span>Background sync</span>
            <span className="settings-menu-item-hint">
              {workerSyncConfigured ? 'Configured — rules & Telegram run even with the tab closed' : 'Keep rules & Telegram running while the browser is closed'}
            </span>
          </span>
          <ChevronRightIcon size={16} className="settings-menu-item-chevron" />
        </button>

        <div className="settings-menu-section-label">Accounts</div>
        <button
          type="button"
          className="settings-menu-item"
          onClick={() => { setShowFeedSync(true); }}
        >
          <PlugConnectedIcon size={18} className="settings-menu-item-icon" />
          <span className="settings-menu-item-label">
            <span>Auto-sync</span>
            <span className="settings-menu-item-hint">
              {feedConnected ? 'Connected — auto-importing accounts from your feed' : 'Automatically import accounts from a feed URL'}
            </span>
          </span>
          <span className={`settings-menu-switch${feedConnected ? ' on' : ''}`} aria-hidden="true">
            <span className="settings-menu-switch-dot" />
          </span>
        </button>

        <button
          type="button"
          className="settings-menu-item"
          onClick={handleDownloadTokens}
        >
          <ArrowDownloadIcon size={18} className="settings-menu-item-icon" />
          <span className="settings-menu-item-label">
            <span>Download tokens</span>
            <span className="settings-menu-item-hint">
              {currentAccount ? `Save ${currentAccount.email}'s current access & refresh token as a JSON file` : 'Select an account first'}
            </span>
          </span>
        </button>
      </div>

      {showTelegram && (
        <TelegramSettings onClose={() => { setShowTelegram(false); onClose(); }} />
      )}

      {showFeedSync && (
        <FeedSyncSettings onClose={() => { setShowFeedSync(false); onClose(); }} />
      )}

      {showWorkerSync && (
        <CloudflareWorkerSettings onClose={() => { setShowWorkerSync(false); onClose(); }} />
      )}
    </>
  );
}
