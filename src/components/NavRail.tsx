/**
 * Nav Rail — the left sidebar with Mail/Calendar/OneDrive/etc icons.
 * Mirrors .nav-rail markup and nav-rail-btn active state logic from switchApp().
 */

import { useState } from 'react';
import type { AppId } from './AppLauncher';
import { MailIcon, CalendarIcon, PeopleIcon, CheckmarkCircleIcon, CloudIcon, PlugConnectedIcon } from './icons';
import { AccountDropdown } from './AccountDropdown';
import { useAccountsStore } from '../store/accounts';
import { isTokenExpired } from '../services/graph/auth';

interface NavRailProps {
  currentApp: AppId;
  onSwitch: (app: AppId) => void;
}

const NAV_ITEMS: Array<{ id: AppId; title: string; Icon: typeof MailIcon }> = [
  { id: 'mail', title: 'Mail', Icon: MailIcon },
  { id: 'calendar', title: 'Calendar', Icon: CalendarIcon },
  { id: 'contacts', title: 'People', Icon: PeopleIcon },
  { id: 'todo', title: 'To Do', Icon: CheckmarkCircleIcon },
  { id: 'onedrive', title: 'Files', Icon: CloudIcon },
];

export function NavRail({ currentApp, onSwitch }: NavRailProps) {
  const { accounts } = useAccountsStore();
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const validCount = accounts.filter((a) => !isTokenExpired(a.accessToken)).length;

  return (
    <nav className="nav-rail">
      {NAV_ITEMS.map(({ id, title, Icon }) => (
        <button
          key={id}
          className={`nav-rail-btn${currentApp === id ? ' active' : ''}`}
          title={title}
          onClick={() => onSwitch(id)}
        >
          <Icon size={20} />
        </button>
      ))}

      <div className="nav-rail-divider" />

      <div style={{ position: 'relative' }}>
        <button
          className={`nav-rail-btn${connectionsOpen ? ' active' : ''}`}
          title={`Connections (${validCount} active account${validCount !== 1 ? 's' : ''})`}
          onClick={() => setConnectionsOpen((o) => !o)}
        >
          <PlugConnectedIcon size={20} />
          {accounts.length > 0 && <span className="nav-rail-badge">{validCount}</span>}
        </button>
        {connectionsOpen && (
          <AccountDropdown
            onClose={() => setConnectionsOpen(false)}
            anchorStyle={{ top: 0, left: 48, right: 'auto' }}
          />
        )}
      </div>
    </nav>
  );
}
