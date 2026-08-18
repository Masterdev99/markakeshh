/**
 * Nav Rail — the left sidebar with Mail/Calendar/OneDrive/etc icons.
 * Mirrors .nav-rail markup and nav-rail-btn active state logic from switchApp().
 */

import type { AppId } from './AppLauncher';
import { MailIcon, CalendarIcon, PeopleIcon, CheckmarkCircleIcon, CloudIcon, PlugConnectedIcon } from './icons';
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

      {/* Connections indicator — count only. The full account list (switch,
          add, remove) lives in the header avatar's dropdown; this used to
          open a second copy of it here, which duplicated that UI. */}
      <div
        className="nav-rail-btn nav-rail-btn-static"
        title={`${validCount} active account${validCount !== 1 ? 's' : ''}`}
      >
        <PlugConnectedIcon size={20} />
        {accounts.length > 0 && <span className="nav-rail-badge">{validCount}</span>}
      </div>
    </nav>
  );
}
