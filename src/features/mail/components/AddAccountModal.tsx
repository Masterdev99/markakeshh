/**
 * Add Account Modal — ported from addAccount() / addAccountWithRefreshOnly() at lines 8534–8722.
 */

import { useState } from 'react';
import { useAccountsStore } from '../../../store/accounts';
import { refreshToken } from '../../../services/graph/auth';
import { saveRefreshProxyUrl, getRefreshProxyUrl } from '../../../services/storage/smtp';
import { useToast } from '../../../app/providers/ToastProvider';
import { DismissIcon } from '../../../components/icons';
import { Modal } from '../../../components/Modal';
import type { Account } from '../../../types';

interface AddAccountModalProps {
  onClose: () => void;
}

export function AddAccountModal({ onClose }: AddAccountModalProps) {
  const { addAccount, accounts, selectAccount } = useAccountsStore();
  const { toast } = useToast();

  const [token, setToken] = useState('');
  const [refreshTokenVal, setRefreshTokenVal] = useState('');
  const [clientId, setClientId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [label, setLabel] = useState('');
  const [proxyUrl, setProxyUrl] = useState(getRefreshProxyUrl() || '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);

  async function handleAdd() {
    const cleanToken = token.replace(/[\s\r\n]+/g, '').trim();
    if (!cleanToken) { setError('Access token is required'); return; }
    setError(''); setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',
        { headers: { Authorization: 'Bearer ' + cleanToken }, signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        if (resp.status === 401) throw new Error('Token expired or invalid (401)');
        throw new Error(`API error ${resp.status}: ${errText.substring(0, 100)}`);
      }
      const me = await resp.json() as { userPrincipalName?: string; mail?: string; displayName?: string };
      const acc: Account = {
        id: Date.now().toString(),
        accessToken: cleanToken,
        refreshToken: refreshTokenVal.replace(/[\s\r\n]+/g, '').trim() || null,
        clientId: clientId.trim() || undefined,
        tenantId: tenantId.trim() || undefined,
        email: me.userPrincipalName || me.mail || label || 'Unknown',
        displayName: me.displayName || label || 'Account',
        label: label || null,
        addedAt: new Date().toISOString(),
        unreadCount: 0,
      };
      addAccount(acc);
      selectAccount(accounts.length); // new account is at the end
      toast('Account added: ' + acc.email + (acc.refreshToken ? ' (auto-refresh on)' : ''), 'success');
      onClose();
    } catch (e) {
      const err = e as Error;
      setError(err.name === 'AbortError' ? 'Request timed out. Check your internet or token.' : err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddWithRefreshOnly() {
    const cleanRefresh = refreshTokenVal.replace(/[\s\r\n]+/g, '').trim();
    if (!cleanRefresh) { setError('Refresh token is required for this option.'); return; }
    const pUrl = proxyUrl.trim() || getRefreshProxyUrl();
    if (!pUrl) {
      setError('Refresh proxy URL is required (browser blocks direct call to Microsoft). On Vercel this is already deployed at /api/refresh — enter that (or your own proxy URL) and click Save proxy URL.');
      return;
    }
    if (proxyUrl.trim()) saveRefreshProxyUrl(proxyUrl.trim());

    setError(''); setRefreshLoading(true);
    const PLACEHOLDER = 'pending_refresh';
    const tempAcc: Account = {
      id: Date.now().toString(),
      accessToken: PLACEHOLDER,
      refreshToken: cleanRefresh,
      clientId: clientId.trim() || undefined,
      tenantId: tenantId.trim() || undefined,
      email: 'Loading...',
      displayName: 'Loading...',
      label: label || null,
      addedAt: new Date().toISOString(),
      unreadCount: 0,
    };

    // Add placeholder to store so refreshToken can read it
    addAccount(tempAcc);
    const idx = accounts.length; // will be the new index after add

    try {
      const accs = useAccountsStore.getState().accounts;
      await refreshToken(idx, accs);
      const currentAcc = accs[idx];
      if (!currentAcc || currentAcc.accessToken === PLACEHOLDER) throw new Error('Refresh did not return an access token');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',
        { headers: { Authorization: 'Bearer ' + currentAcc.accessToken }, signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(resp.status === 401 ? 'Token expired or invalid after refresh' : `API error ${resp.status}: ${errText.substring(0, 80)}`);
      }
      const me = await resp.json() as { userPrincipalName?: string; mail?: string; displayName?: string };
      useAccountsStore.getState().updateAccount(idx, {
        email: me.userPrincipalName || me.mail || label || 'Unknown',
        displayName: me.displayName || label || 'Account',
      });
      selectAccount(idx);
      toast('Account added and refreshed: ' + (me.userPrincipalName || me.mail), 'success');
      onClose();
    } catch (e) {
      // Roll back
      useAccountsStore.getState().removeAccount(idx);
      setError((e as Error).message || 'Refresh failed. Check refresh token, Client ID, and Tenant ID.');
    } finally {
      setRefreshLoading(false);
    }
  }

  return (
    <Modal onClose={onClose} id="addAccountModal">
        <div className="modal-header">
          <h2>Add Account</h2>
          <button className="modal-close" onClick={onClose}>
            <DismissIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Access Token</label>
            <textarea
              className="form-input form-textarea"
              id="inputToken"
              placeholder="Paste access token (eyJ0...)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <div className="form-hint">Token from Telegram notification</div>
          </div>

          <div className="form-group">
            <label className="form-label">Refresh Token (optional — for auto-refresh)</label>
            <textarea
              className="form-input form-textarea"
              id="inputRefreshToken"
              placeholder="Paste refresh token to enable auto-refresh (optional)"
              style={{ height: 60 }}
              value={refreshTokenVal}
              onChange={(e) => setRefreshTokenVal(e.target.value)}
            />
            <div className="form-hint">With refresh token, the mailbox stays active indefinitely</div>
          </div>

          <div className="form-group">
            <label className="form-label">Client ID (optional)</label>
            <input type="text" className="form-input" id="inputClientId"
              placeholder="Override default Microsoft 365 app client ID (optional)"
              value={clientId} onChange={(e) => setClientId(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Tenant ID (optional)</label>
            <input type="text" className="form-input" id="inputTenantId"
              placeholder="e.g., contoso.onmicrosoft.com or tenant GUID"
              value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Label (optional)</label>
            <input type="text" className="form-input" id="inputLabel"
              placeholder="e.g., CEO, Finance"
              value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div className="form-group" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
            <label className="form-label">Refresh proxy URL (for CORS)</label>
            <input type="text" className="form-input" id="inputRefreshProxyUrl"
              placeholder="/api/refresh (Vercel) or http://127.0.0.1:3742/refresh (local)"
              value={proxyUrl} onChange={(e) => setProxyUrl(e.target.value)} />
            <div className="form-hint">
              Deployed on Vercel? Use <code>/api/refresh</code> — it ships with this app, no separate process needed.
              Running locally instead? Run <code>node refresh-proxy.js</code> and use <code>http://127.0.0.1:3742/refresh</code>.
            </div>
            <button
              type="button"
              className="modal-btn secondary"
              style={{ marginTop: 6 }}
              onClick={() => { if (proxyUrl.trim()) { saveRefreshProxyUrl(proxyUrl.trim()); toast('Proxy URL saved', 'success'); } }}
            >
              Save proxy URL
            </button>
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>

        <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="modal-btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn primary"
            id="addAccountBtn"
            onClick={handleAdd}
            disabled={loading}
          >
            {loading ? 'Adding...' : 'Add Account'}
          </button>
          <button
            className="modal-btn primary"
            id="addWithRefreshBtn"
            onClick={handleAddWithRefreshOnly}
            disabled={refreshLoading}
            style={{ background: 'var(--success)' }}
          >
            {refreshLoading ? 'Adding & refreshing...' : 'Add with refresh only'}
          </button>
        </div>
    </Modal>
  );
}
