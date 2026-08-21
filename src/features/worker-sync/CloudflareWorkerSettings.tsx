/**
 * Cloudflare Worker background-sync settings — lets local console rules
 * (Telegram notify + move/markAsRead/permanentDelete) keep running via a
 * separate Cloudflare Worker while the browser is closed. See
 * /cloudflare-worker for the Worker itself and its deploy instructions.
 *
 * Structurally mirrors ../smtp-forwarding/TelegramSettings.tsx.
 */
import { useEffect, useState } from 'react';
import { getWorkerSyncSecret, getWorkerSyncUrl, saveWorkerSyncSecret, saveWorkerSyncUrl } from '../../services/storage/workerSync';
import { fetchWorkerStatus, syncToWorker, type WorkerStatus } from '../../services/workerSyncClient';
import { useToast } from '../../app/providers/ToastProvider';
import { DismissIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';

interface CloudflareWorkerSettingsProps {
  onClose: () => void;
}

export function CloudflareWorkerSettings({ onClose }: CloudflareWorkerSettingsProps) {
  const { toast } = useToast();
  const [workerUrl, setWorkerUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState<WorkerStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setWorkerUrl(getWorkerSyncUrl() || '');
    setSecret(getWorkerSyncSecret() || '');
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshStatus() {
    if (!getWorkerSyncUrl() || !getWorkerSyncSecret()) return;
    fetchWorkerStatus()
      .then((s) => { setStatus(s); setStatusError(null); })
      .catch((e: Error) => { setStatus(null); setStatusError(e.message); });
  }

  function handleSave() {
    if (!workerUrl.trim() || !secret.trim()) { toast('Worker URL and Sync Secret are required', 'error'); return; }
    saveWorkerSyncUrl(workerUrl.trim());
    saveWorkerSyncSecret(secret.trim());
    toast('Background sync settings saved', 'success');
    handleSyncNow();
  }

  function handleGenerateSecret() {
    setSecret(crypto.randomUUID().replace(/-/g, ''));
  }

  async function handleSyncNow() {
    if (!workerUrl.trim() || !secret.trim()) {
      setSyncResult({ msg: '✗ Worker URL and Sync Secret are required', ok: false });
      return;
    }
    // "Sync now" should act on whatever's currently typed, not require a
    // prior Save first — persist silently, same as clicking Save would.
    saveWorkerSyncUrl(workerUrl.trim());
    saveWorkerSyncSecret(secret.trim());

    setSyncing(true);
    setSyncResult(null);
    try {
      const { accountCount } = await syncToWorker();
      setSyncResult({ msg: `✓ Synced ${accountCount} account(s) to the Worker`, ok: true });
      refreshStatus();
    } catch (e) {
      setSyncResult({ msg: '✗ ' + (e as Error).message, ok: false });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Modal onClose={onClose} id="cloudflareWorkerSettingsModal">
      <div className="modal-header">
        <h2>Background Sync (Cloudflare Worker)</h2>
        <button className="modal-close" onClick={onClose}>
          <DismissIcon size={18} />
        </button>
      </div>
      <div className="modal-body">
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, padding: '8px 12px', background: 'var(--primary-light)', borderRadius: 6 }}>
          Optional: run a small Cloudflare Worker that polls your mail and applies local console rules (Telegram notify, move/mark read/delete) on a schedule, so they keep working even when this browser tab is closed. See <code>/cloudflare-worker</code> in the project for deploy steps.
        </div>

        <div style={{ fontSize: 12, color: 'var(--error)', marginBottom: 12, padding: '8px 12px', background: 'var(--error-light)', borderRadius: 6 }}>
          Once you sync, your account refresh token(s) and Telegram bot token are sent to, and stored at rest in, that Worker — gated only by the Sync Secret below. Today, without this, those tokens never leave your browser. Treat the secret like a password.
        </div>

        <div className="form-group">
          <label className="form-label">Worker URL</label>
          <input
            className="form-input"
            value={workerUrl}
            onChange={(e) => setWorkerUrl(e.target.value)}
            placeholder="https://outlook-rule-sync-worker.<subdomain>.workers.dev"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Sync Secret</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="form-input"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Same value as `wrangler secret put SYNC_SECRET`"
            />
            <button type="button" className="modal-btn secondary" onClick={handleGenerateSecret} style={{ flexShrink: 0 }}>
              Generate
            </button>
          </div>
          <div className="form-hint">Generated here, it still needs to be set on the Worker via <code>wrangler secret put SYNC_SECRET</code>.</div>
        </div>

        <div className="form-hint" style={{ marginTop: 4 }}>
          {status
            ? `Connected — last checked ${status.lastRun ? new Date(status.lastRun).toLocaleString() : 'never'}, watching ${status.accountCount} account(s)${status.lastError ? ` · last error: ${status.lastError}` : ''}`
            : statusError
              ? `Not connected — ${statusError}`
              : 'Not connected yet'}
        </div>

        {syncResult && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
              marginTop: 8,
              background: syncResult.ok ? 'var(--success-light)' : 'var(--error-light)',
              color: syncResult.ok ? 'var(--success)' : 'var(--error)',
            }}
          >
            {syncResult.msg}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="modal-btn secondary" onClick={handleSyncNow} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        <button className="modal-btn primary" onClick={handleSave}>Save Settings</button>
      </div>
    </Modal>
  );
}
