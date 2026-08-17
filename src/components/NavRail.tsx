/**
 * Nav Rail — the left sidebar with Mail/Calendar/OneDrive/etc icons.
 * Mirrors .nav-rail markup and nav-rail-btn active state logic from switchApp().
 */

import type { AppId } from './AppLauncher';
import { MailIcon, CalendarIcon, PeopleIcon, CheckmarkCircleIcon, CloudIcon } from './icons';

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
    </nav>
  );
}
