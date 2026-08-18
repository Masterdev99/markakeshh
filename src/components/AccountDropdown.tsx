/**
 * Account Dropdown — shows all accounts, add/remove actions.
 * Mirrors renderAccountDropdown() at lines 8218–8261.
 */

import { useRef, useEffect, useState } from 'react';
import { useAccountsStore } from '../store/accounts';
import { getInitials, getAvatarColor } from '../utils/avatar';
import { isTokenExpired } from '../services/graph/auth';
import { AddAccountModal } from '../features/mail/components/AddAccountModal';

interface AccountDropdownProps {
  onClose: () => void;
  /** Overrides the default top-right (header avatar) anchor position — used when opened from the nav rail's connections icon. */
  anchorStyle?: React.CSSProperties;
}

export function AccountDropdown({ onClose, anchorStyle }: AccountDropdownProps) {
  const { accounts, currentAccountIdx, selectAccount, removeAccount } = useAccountsStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function handleSelect(idx: number) {
    selectAccount(idx);
    onClose();
  }

  function handleRemove(e: React.MouseEvent, idx: number) {
    e.stopPropagation();
    if (confirm('Remove this account?')) removeAccount(idx);
  }

  function handleOpenInNewTab(e: React.MouseEvent, acc: { id: string }) {
    e.stopPropagation();
    const url = new URL(window.location.href);
    url.searchParams.set('accountId', acc.id);
    window.open(url.toString(), '_blank');
  }

  return (
    <>
      <div className="account-dropdown" id="accountDropdown" ref={ref} style={anchorStyle}>
        <div className="account-dropdown-list">
        {accounts.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
            No accounts added
          </div>
        ) : (
          accounts.map((acc, i) => {
            const initials = getInitials(acc.displayName || acc.email);
            const color = getAvatarColor(acc.email);
            const expired = isTokenExpired(acc.accessToken);
            return (
              <div
                key={acc.id}
                className={`account-dropdown-item${i === currentAccountIdx ? ' active' : ''}`}
                onClick={() => handleSelect(i)}
              >
                <div className="avatar" style={{ background: color }}>{initials}</div>
                <div className="info" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.displayName || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {acc.email}
                  </div>
                </div>
                <span className={`status ${expired ? 'expired' : 'valid'}`}>
                  {expired ? 'Expired' : 'Active'}
                </span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button
                    className="modal-btn secondary"
                    style={{ padding: '3px 6px', fontSize: 11 }}
                    onClick={(e) => handleOpenInNewTab(e, acc)}
                    title="Open in new tab"
                  >
                    <svg viewBox="0 0 24 24" width={14} height={14} style={{ fill: 'currentColor' }}>
                      <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
                    </svg>
                  </button>
                  <button
                    className="modal-btn secondary"
                    style={{ padding: '3px 6px', fontSize: 11, color: 'var(--error)' }}
                    onClick={(e) => handleRemove(e, i)}
                    title="Remove account"
                  >
                    <svg viewBox="0 0 24 24" width={14} height={14} style={{ fill: 'currentColor' }}>
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })
        )}
        </div>

        <div className="account-dropdown-footer">
          <button onClick={() => { onClose(); /* TODO: switchApp('account') */ }}>My Account</button>
          <button className="primary" onClick={() => { setShowAddModal(true); }}>+ Add Account</button>
        </div>
      </div>

      {showAddModal && (
        <AddAccountModal onClose={() => { setShowAddModal(false); onClose(); }} />
      )}
    </>
  );
}
