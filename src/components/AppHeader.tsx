/**
 * App Header — the top blue bar with waffle, brand, search, and user avatar.
 * Mirrors the .header markup and related functions.
 */

import { useEffect, useRef, useState } from 'react';
import { AppLauncher, type AppId } from './AppLauncher';
import { AccountDropdown } from './AccountDropdown';
import { SettingsMenu } from './SettingsMenu';
import { useAccountsStore } from '../store/accounts';
import { useFoldersStore } from '../store/folders';
import { useSearchStore } from '../store/search';
import { useToast } from '../app/providers/ToastProvider';
import { getInitials, getAvatarColor } from '../utils/avatar';
import { AppsIcon, SearchIcon, ArrowLeftIcon, SettingsIcon, ChevronDownIcon, ChevronRightIcon, MailIcon } from './icons';
import type { MailFolder } from '../types';

function flattenWithDepth(items: MailFolder[], depth = 0): Array<{ folder: MailFolder; depth: number }> {
  const out: Array<{ folder: MailFolder; depth: number }> = [];
  for (const f of items) {
    out.push({ folder: f, depth });
    if (f.children) out.push(...flattenWithDepth(f.children, depth + 1));
  }
  return out;
}

interface AppHeaderProps {
  currentApp: AppId;
  onSwitchApp: (app: AppId) => void;
}

const SCOPE_LABELS: Record<string, string> = { all: 'All folders', current: 'Current folder', subfolders: 'Subfolders' };

export function AppHeader({ currentApp, onSwitchApp }: AppHeaderProps) {
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const scopeWrapRef = useRef<HTMLDivElement>(null);

  const { accounts, currentAccountIdx, isAdmin } = useAccountsStore();
  const { folders } = useFoldersStore();
  const search = useSearchStore();
  const { toast } = useToast();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;

  const initials = account ? getInitials(account.displayName || account.email) : '?';
  const avatarBg = account ? getAvatarColor(account.email) : '#8764b8';

  // Close the scope dropdown on outside click — mirrors the original's document-level listener.
  useEffect(() => {
    if (!scopeMenuOpen) return;
    function handler(e: MouseEvent) {
      if (scopeWrapRef.current && !scopeWrapRef.current.contains(e.target as Node)) {
        setScopeMenuOpen(false);
        setFavoritesOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [scopeMenuOpen]);

  function triggerSearch() {
    const query = searchValue.trim();
    if (!query) { toast('Enter a search term', 'info'); return; }
    if (currentApp === 'mail') {
      search.startSearch(query);
    } else {
      toast('Search in this app coming soon', 'info');
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    triggerSearch();
  }

  function handleExitSearch() {
    search.exitSearch();
    setSearchValue('');
  }

  // Exiting search can also happen elsewhere (e.g. the message list header's
  // own clear button just calls search.exitSearch() directly, with no way to
  // reach this component's local input state) — react to the shared store
  // instead of only handling it locally, so the box can't be left showing
  // stale typed text after search was cleared some other way.
  useEffect(() => {
    if (!search.isSearchActive) setSearchValue('');
  }, [search.isSearchActive]);

  function pickScope(type: 'all' | 'current' | 'subfolders' | 'folder', folderId?: string, folderName?: string) {
    search.setScope({ type, folderId: folderId ?? null, folderName: folderName ?? null });
    setScopeMenuOpen(false);
    setFavoritesOpen(false);
    if (search.query.trim()) search.startSearch(search.query.trim());
  }

  const scopeLabel = search.scope.folderName || SCOPE_LABELS[search.scope.type] || 'All folders';
  const flatFolders = flattenWithDepth(folders);

  const APP_NAMES: Record<string, string> = {
    mail: 'Outlook', calendar: 'Calendar', onedrive: 'OneDrive',
    teams: 'Teams', sharepoint: 'SharePoint', contacts: 'Contacts',
    onenote: 'OneNote', planner: 'Planner', todo: 'To Do',
    admin: 'Admin Center', account: 'My Account',
  };

  return (
    <header className="header">
      {/* Waffle / App Launcher button */}
      <button
        className="app-launcher-btn"
        onClick={() => setLauncherOpen((o) => !o)}
        title="App launcher"
        id="appLauncherBtn"
      >
        <AppsIcon size={20} />
      </button>

      <AppLauncher
        currentApp={currentApp}
        onSwitch={onSwitchApp}
        isOpen={launcherOpen}
        onClose={() => setLauncherOpen(false)}
      />

      {/* Brand */}
      <div className="header-brand" onClick={() => onSwitchApp('mail')}>
        <MailIcon size={20} style={{ fill: '#fff' }} />
        <span id="currentAppName">{APP_NAMES[currentApp] ?? currentApp}</span>
        {isAdmin && <span className="admin-badge">ADMIN</span>}
      </div>

      {/* Global Search */}
      <div className="header-search">
        <div className="search-scope-wrap" ref={scopeWrapRef}>
          <button
            type="button"
            className="search-scope-btn"
            onClick={() => setScopeMenuOpen((o) => !o)}
          >
            <span>{scopeLabel}</span>
            <ChevronDownIcon size={14} className="scope-chevron" />
          </button>
          {scopeMenuOpen && (
            <div className="search-scope-menu">
              <div
                className={`search-scope-item${search.scope.type === 'all' ? ' active' : ''}`}
                data-scope="all"
                onClick={() => pickScope('all')}
              >All folders</div>
              <div
                className={`search-scope-item${search.scope.type === 'current' ? ' active' : ''}`}
                data-scope="current"
                onClick={() => pickScope('current')}
              >Current folder</div>
              <div
                className={`search-scope-item${search.scope.type === 'subfolders' ? ' active' : ''}`}
                data-scope="subfolders"
                onClick={() => pickScope('subfolders')}
              >Subfolders</div>
              <div
                className="search-scope-item"
                onClick={(e) => { e.stopPropagation(); setFavoritesOpen((o) => !o); }}
              >
                <span>Favorites</span>
                <ChevronRightIcon size={14} className="scope-chevron-right" />
                {favoritesOpen && (
                  <div className="search-scope-submenu">
                    {flatFolders.length === 0 ? (
                      <div className="search-scope-item" style={{ color: 'var(--text-muted)', cursor: 'default' }}>No folders loaded</div>
                    ) : flatFolders.map(({ folder, depth }) => (
                      <div
                        key={folder.id}
                        className="search-scope-item"
                        style={{ paddingLeft: 14 + depth * 14 }}
                        onClick={(e) => { e.stopPropagation(); pickScope('folder', folder.id, folder.displayName); }}
                      >{folder.displayName}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <form className="header-search-box" onSubmit={handleSearchSubmit}>
          {search.isSearchActive ? (
            <ArrowLeftIcon size={16} onClick={handleExitSearch} style={{ cursor: 'pointer' }} />
          ) : (
            <SearchIcon size={16} />
          )}
          <input
            type="text"
            placeholder="Search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            id="globalSearchInput"
            autoComplete="off"
          />
          <button type="button" className="search-box-icon-btn" title="Search" onClick={triggerSearch}>
            <SearchIcon size={15} />
          </button>
        </form>
      </div>

      {/* Right actions */}
      <div className="header-actions">
        <div style={{ position: 'relative' }}>
          <button
            className={`header-btn${settingsOpen ? ' active' : ''}`}
            title="Settings"
            id="settingsBtn"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            <SettingsIcon size={19} />
          </button>
          {settingsOpen && <SettingsMenu onClose={() => setSettingsOpen(false)} />}
        </div>

        {/* User avatar / account dropdown toggle */}
        <div
          className="header-avatar"
          id="userAvatar"
          style={{ background: avatarBg, color: '#fff' }}
          onClick={() => setAccountOpen((o) => !o)}
          title={account?.displayName || account?.email || 'Account'}
        >
          {initials}
        </div>

        {accountOpen && (
          <AccountDropdown onClose={() => setAccountOpen(false)} />
        )}
      </div>
    </header>
  );
}
