/**
 * Auto-Sync settings — configures the EVG feed URL that automatically
 * imports/refreshes accounts on an interval (services/feedSync.ts already
 * runs this loop; this panel is the missing settings UI for it).
 *
 * Ported from the "Auto-Sync" tab of the settings modal at lines 7662–7712.
 */

import { useEffect, useState } from 'react';
import { loadFeedSettings, saveFeedSettings, clearFeedSettings } from '../../services/storage/feed';
import { useToast } from '../../app/providers/ToastProvider';
import { DismissIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';

interface FeedSyncSettingsProps {
  onClose: () => void;
}

const INTERVAL_OPTIONS = [
  { value: 15, label: 'Every 15 seconds' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every 1 minute' },
  { value: 300, label: 'Every 5 minutes' },
];

export function FeedSyncSettings({ onClose }: FeedSyncSettingsProps) {
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [interval, setIntervalVal] = useState(30);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = loadFeedSettings();
    if (s) { setUrl(s.url); setIntervalVal(s.interval); setConnected(true); }
  }, []);

  function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) { toast('Feed URL is required', 'error'); return; }
    saveFeedSettings({ url: trimmed, interval });
    setConnected(true);
    window.dispatchEvent(new Event('outlook:feed-settings-changed'));
    toast('Auto-sync enabled', 'success');
  }

  function handleDisconnect() {
    clearFeedSettings();
    setConnected(false);
    window.dispatchEvent(new Event('outlook:feed-settings-changed'));
    toast('Auto-sync disconnected', 'info');
  }

  return (
    <Modal onClose={onClose} id="feedSettingsModal" style={{ width: 480, maxWidth: '95vw' }}>
      <div className="modal-header">
        <h2>Auto-Sync</h2>
        <button className="modal-close" onClick={onClose}>
          <DismissIcon size={18} />
        </button>
      </div>
      <div className="modal-body">
        <div style={{ fontSize: 13, color: 'var(--primary)', marginBottom: 12, padding: '10px 12px', background: 'var(--primary-light)', borderRadius: 6 }}>
          <strong>Auto-sync</strong> connects to a feed server and automatically imports/refreshes captured accounts on an interval.
        </div>

        <div className="form-group">
          <label className="form-label">Feed URL</label>
          <input
            className="form-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-domain.com/api/v1/feed?key=YOUR_API_KEY"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Sync Interval</label>
          <select
            className="form-input"
            style={{ padding: '8px 12px' }}
            value={interval}
            onChange={(e) => setIntervalVal(Number(e.target.value))}
          >
            {INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 8, padding: 10, background: 'var(--surface-alt)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          {connected ? 'Connected — the sync loop runs in the background while the app is open.' : 'Not connected'}
        </div>
      </div>
      <div className="modal-footer">
        {connected && (
          <button className="modal-btn secondary" style={{ color: 'var(--error)' }} onClick={handleDisconnect}>Disconnect</button>
        )}
        <button className="modal-btn primary" onClick={handleSave}>Save</button>
      </div>
    </Modal>
  );
}
