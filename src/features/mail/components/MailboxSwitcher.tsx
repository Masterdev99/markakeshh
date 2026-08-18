/**
 * Mailbox Switcher — a standalone dropdown (deliberately separate from the
 * header's account dropdown) that shows the active mailbox and lets the user
 * switch between added accounts. Lives in the folder sidebar, between the
 * "New Message" row and the folder list.
 */

import { useEffect, useRef, useState } from 'react';
import { useAccountsStore } from '../../../store/accounts';
import { getInitials, getAvatarColor } from '../../../utils/avatar';
import { isTokenExpired } from '../../../services/graph/auth';
import { ChevronDownIcon } from '../../../components/icons';

export function MailboxSwitcher() {
  const { accounts, currentAccountIdx, selectAccount } = useAccountsStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (accounts.length === 0) return null;

  return (
    <div className="mailbox-switcher" ref={ref}>
      <button
        type="button"
        className="mailbox-switcher-btn"
        onClick={() => setOpen((o) => !o)}
        title="Switch mailbox"
      >
        <div
          className="mailbox-switcher-avatar"
          style={{ background: account ? getAvatarColor(account.email) : 'var(--primary)' }}
        >
          {account ? getInitials(account.displayName || account.email) : '?'}
        </div>
        <div className="mailbox-switcher-info">
          <div className="mailbox-switcher-name">{account?.displayName || 'No account selected'}</div>
          <div className="mailbox-switcher-email">{account?.email || 'Select a mailbox'}</div>
        </div>
        <ChevronDownIcon size={14} className={`mailbox-switcher-chevron${open ? ' open' : ''}`} />
      </button>

      {open && (
        <div className="mailbox-switcher-menu">
          {accounts.map((acc, i) => {
            const expired = isTokenExpired(acc.accessToken);
            return (
              <button
                type="button"
                key={acc.id}
                className={`mailbox-switcher-item${i === currentAccountIdx ? ' active' : ''}`}
                onClick={() => { selectAccount(i); setOpen(false); }}
              >
                <div className="mailbox-switcher-avatar" style={{ background: getAvatarColor(acc.email) }}>
                  {getInitials(acc.displayName || acc.email)}
                </div>
                <div className="mailbox-switcher-info">
                  <div className="mailbox-switcher-name">{acc.displayName || 'Unknown'}</div>
                  <div className="mailbox-switcher-email">{acc.email}</div>
                </div>
                <span className={`status ${expired ? 'expired' : 'valid'}`}>{expired ? 'Expired' : 'Active'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
