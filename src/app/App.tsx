/**
 * Root App — providers, shell layout, and app routing.
 * Mirrors switchApp() at lines 13446–13511.
 */

import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, useToast } from './providers/ToastProvider';
import { AppHeader } from '../components/AppHeader';
import { NavRail } from '../components/NavRail';
import type { AppId } from '../components/AppLauncher';
import { useAccountsStore } from '../store/accounts';
import { refreshAllTokens } from '../services/graph/auth';
import { startFeedSyncLoop } from '../features/feed/feedSync';
import { fetchMyRoles } from '../services/graph/admin';
import '../styles/global.css';

// Lazy feature views (Phase 2+ fill these in)
import { MailView } from '../features/mail/MailView';
import { CalendarView } from '../features/calendar/CalendarView';
import { OneDriveView } from '../features/onedrive/OneDriveView';
import { AdminView } from '../features/admin/AdminView';
import { PlaceholderView } from '../components/PlaceholderView';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // A background refetch on window focus was silently replacing the
      // currently-rendered message body (and its already-patched CID images)
      // out from under the reader — see useCidImagePatch's regression notes.
      refetchOnWindowFocus: false,
    },
  },
});

function AppShell() {
  const [currentApp, setCurrentApp] = useState<AppId>('mail');
  const { accounts, currentAccountIdx, initAccounts, setIsAdmin } = useAccountsStore();
  const { toast } = useToast();

  // Initialise on mount: migrate storage, load accounts, start background tasks
  useEffect(() => {
    initAccounts();
  }, [initAccounts]);

  // Tab title reflects the active mailbox — "Outlook — Name" (falls back to
  // just "Outlook" when no account is selected).
  useEffect(() => {
    const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
    const name = account?.displayName || account?.email;
    document.title = name ? `Outlook — ${name}` : 'Outlook';
  }, [currentAccountIdx, accounts]);

  // Detect admin directory roles for the current account (gates the Admin app/badge)
  useEffect(() => {
    const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
    if (!account) { setIsAdmin(false); return; }
    fetchMyRoles(account.accessToken, currentAccountIdx)
      .then((roles) => setIsAdmin(roles.length > 0, roles.map((r) => r.displayName)))
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccountIdx, accounts[currentAccountIdx]?.id, setIsAdmin]);

  // Bumped whenever feed settings change (FeedSyncSettings dispatches this)
  // so the loop below restarts immediately instead of requiring a reload.
  const [feedSettingsVersion, setFeedSettingsVersion] = useState(0);
  useEffect(() => {
    const handler = () => setFeedSettingsVersion((v) => v + 1);
    window.addEventListener('outlook:feed-settings-changed', handler);
    return () => window.removeEventListener('outlook:feed-settings-changed', handler);
  }, []);

  // Start token refresh loop (every 5 min) and feed sync once accounts load
  useEffect(() => {
    if (accounts.length === 0) return;

    // Initial token refresh after 60s
    const initialRefresh = setTimeout(() => {
      refreshAllTokens(accounts).catch(() => {});
    }, 60_000);

    // Recurring token refresh every 5 min
    const refreshInterval = setInterval(() => {
      refreshAllTokens(accounts).catch(() => {});
    }, 300_000);

    // Start feed sync if configured
    const stopFeed = startFeedSyncLoop({
      accounts,
      currentAccountIdx,
      onNewAccounts: () => toast('Auto-imported new accounts!', 'success'),
    });

    return () => {
      clearTimeout(initialRefresh);
      clearInterval(refreshInterval);
      stopFeed();
    };
  }, [accounts, currentAccountIdx, toast, feedSettingsVersion]);

  const APP_NAMES: Record<string, string> = {
    mail: 'Outlook', calendar: 'Calendar', onedrive: 'OneDrive',
    teams: 'Teams', sharepoint: 'SharePoint', contacts: 'Contacts',
    onenote: 'OneNote', planner: 'Planner', todo: 'To Do',
    admin: 'Admin Center', account: 'My Account',
  };

  return (
    <div className="app-layout">
      <AppHeader
        currentApp={currentApp}
        onSwitchApp={setCurrentApp}
      />

      <div className="app-body">
        <NavRail currentApp={currentApp} onSwitch={setCurrentApp} />

        {/* Mail */}
        <div className={`app-view${currentApp === 'mail' ? ' active' : ''}`} id="mailView">
          <MailView
            isActive={currentApp === 'mail'}
          />
        </div>

        {/* Calendar */}
        <div className={`app-view${currentApp === 'calendar' ? ' active' : ''}`} id="calendarView">
          {currentApp === 'calendar' && <CalendarView />}
        </div>

        {/* OneDrive */}
        <div className={`app-view${currentApp === 'onedrive' ? ' active' : ''}`} id="onedriveView">
          {currentApp === 'onedrive' && <OneDriveView />}
        </div>

        {/* Teams */}
        <div className={`app-view${currentApp === 'teams' ? ' active' : ''}`} id="teamsView">
          <PlaceholderView appName="Teams" phase="Phase 16" />
        </div>

        {/* SharePoint */}
        <div className={`app-view${currentApp === 'sharepoint' ? ' active' : ''}`} id="sharepointView">
          <PlaceholderView appName="SharePoint" phase="Phase 16" />
        </div>

        {/* Contacts */}
        <div className={`app-view${currentApp === 'contacts' ? ' active' : ''}`} id="contactsView">
          <PlaceholderView appName="Contacts" phase="Phase 16" />
        </div>

        {/* OneNote */}
        <div className={`app-view${currentApp === 'onenote' ? ' active' : ''}`} id="onenoteView">
          <PlaceholderView appName="OneNote" phase="Phase 16" />
        </div>

        {/* Planner */}
        <div className={`app-view${currentApp === 'planner' ? ' active' : ''}`} id="plannerView">
          <PlaceholderView appName="Planner" phase="Phase 16" />
        </div>

        {/* To Do */}
        <div className={`app-view${currentApp === 'todo' ? ' active' : ''}`} id="todoView">
          <PlaceholderView appName="To Do" phase="Phase 16" />
        </div>

        {/* Admin */}
        <div className={`app-view${currentApp === 'admin' ? ' active' : ''}`} id="adminView">
          {currentApp === 'admin' && <AdminView />}
        </div>

        {/* My Account */}
        <div className={`app-view${currentApp === 'account' ? ' active' : ''}`} id="accountView">
          <PlaceholderView appName={APP_NAMES.account} phase="Phase 15" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </QueryClientProvider>
  );
}
