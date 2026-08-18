/**
 * Settings menu — opened from the header gear icon next to the avatar.
 * Consolidates cross-cutting preferences that don't belong to one feature
 * panel: search refinement visibility and Telegram notification settings
 * (previously buried inside the Rules manager).
 */

import { useEffect, useRef, useState } from 'react';
import { useSearchStore } from '../store/search';
import { TelegramSettings } from '../features/smtp-forwarding/TelegramSettings';
import { FeedSyncSettings } from '../features/feed/FeedSyncSettings';
import { loadFeedSettings } from '../services/storage/feed';
import { FilterIcon, ChatIcon, ChevronRightIcon, PlugConnectedIcon } from './icons';

interface SettingsMenuProps {
  onClose: () => void;
}

export function SettingsMenu({ onClose }: SettingsMenuProps) {
  const search = useSearchStore();
  const [showTelegram, setShowTelegram] = useState(false);
  const [showFeedSync, setShowFeedSync] = useState(false);
  const feedConnected = !!loadFeedSettings();
  const ref = useRef<HTMLDivElement>(null);

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
      </div>

      {showTelegram && (
        <TelegramSettings onClose={() => { setShowTelegram(false); onClose(); }} />
      )}

      {showFeedSync && (
        <FeedSyncSettings onClose={() => { setShowFeedSync(false); onClose(); }} />
      )}
    </>
  );
}
