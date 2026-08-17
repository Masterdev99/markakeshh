/**
 * App Launcher — the M365 app grid that drops down from the waffle icon.
 * Mirrors toggleAppLauncher / filterApps / switchApp at lines 13399–13511.
 */

import { useEffect, useRef, useState } from 'react';

type AppId =
  | 'mail' | 'calendar' | 'onedrive' | 'teams' | 'sharepoint'
  | 'contacts' | 'onenote' | 'planner' | 'todo' | 'admin' | 'account';

interface AppLauncherProps {
  currentApp: AppId;
  onSwitch: (app: AppId) => void;
  isOpen: boolean;
  onClose: () => void;
}

const APPS: Array<{ id: AppId; name: string; color: string; icon: string }> = [
  { id: 'mail', name: 'Outlook', color: '#0072C6', icon: 'M' },
  { id: 'calendar', name: 'Calendar', color: '#0D6EFD', icon: 'C' },
  { id: 'teams', name: 'Teams', color: '#6264A7', icon: 'T' },
  { id: 'onedrive', name: 'OneDrive', color: '#0078D4', icon: 'D' },
  { id: 'sharepoint', name: 'SharePoint', color: '#036C70', icon: 'SP' },
  { id: 'onenote', name: 'OneNote', color: '#7719AA', icon: 'N' },
  { id: 'planner', name: 'Planner', color: '#31752F', icon: 'P' },
  { id: 'todo', name: 'To Do', color: '#2564CF', icon: '✓' },
  { id: 'contacts', name: 'Contacts', color: '#0078D4', icon: 'Co' },
  { id: 'admin', name: 'Admin', color: '#C4314B', icon: 'A' },
  { id: 'account', name: 'My Account', color: '#605E5C', icon: '◉' },
];

export function AppLauncher({ currentApp, onSwitch, isOpen, onClose }: AppLauncherProps) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // Reset search when closed
  useEffect(() => { if (!isOpen) setQuery(''); }, [isOpen]);

  const filtered = APPS.filter((a) =>
    !query || a.name.toLowerCase().includes(query.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="app-launcher show" ref={ref} id="appLauncher">
      <div className="app-launcher-search">
        <input
          type="text"
          placeholder="Search apps"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          id="appSearchInput"
          autoFocus
        />
      </div>
      <div className="app-launcher-section">Apps</div>
      <div className="app-launcher-grid" id="appGrid">
        {filtered.map((app) => (
          <button
            key={app.id}
            className={`app-item${currentApp === app.id ? ' active' : ''}`}
            data-app={app.id}
            data-name={app.name}
            onClick={() => { onSwitch(app.id); onClose(); }}
            title={app.name}
          >
            <div className="app-item-icon">
              <div style={{
                width: 40, height: 40,
                borderRadius: 8,
                background: app.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
              }}>
                {app.icon}
              </div>
            </div>
            <span className="app-item-name">{app.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { AppId };
