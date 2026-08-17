/**
 * MailView — the top-level mail surface: toolbar + folder sidebar + message list + reading pane.
 * Orchestrates data loading, bulk actions, live sync, and panel resizing.
 */

import { useEffect, useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccountsStore } from '../../store/accounts';
import { useFoldersStore } from '../../store/folders';
import { useSelectionStore } from '../../store/selection';
import { useSearchStore } from '../../store/search';
import { FolderSidebar } from './components/FolderSidebar';
import { MessageList } from './components/MessageList';
import { ReadingPane } from './components/ReadingPane';
import { useLiveSync } from './hooks/useLiveSync';
import { fetchMessages, markMessageRead, deleteMessage, permanentDeleteMessage, moveMessage, flagMessage, searchMessages, searchMessagesInFolder } from '../../services/graph/messages';
import { useToast } from '../../app/providers/ToastProvider';
import { ComposeWindow } from '../compose/ComposeWindow';
import { SignatureManager } from '../signatures/SignatureManager';
import { RulesManager } from '../rules/RulesManager';
import { exportFolderAddresses, exportFullMailboxAddresses, exportAccountsDatabase, importAccountsDatabase } from '../../services/export';
import {
  MailAddIcon, SignatureIcon, FilterIcon, ArrowDownloadIcon, CloudIcon,
  DatabaseIcon, ArrowUploadIcon, DismissIcon,
} from '../../components/icons';
import type { Message, MailFolder } from '../../types';
import './mail.css';
import '../compose/compose.css';

interface MailViewProps {
  isActive: boolean;
  onSyncStatusChange: (status: string) => void;
}

function flattenFolders(items: MailFolder[]): Array<{ id: string; displayName: string }> {
  const out: Array<{ id: string; displayName: string }> = [];
  for (const f of items) {
    out.push({ id: f.id, displayName: f.displayName });
    if (f.children) out.push(...flattenFolders(f.children));
  }
  return out;
}

const SYSTEM_FOLDER_LABELS: Record<string, string> = {
  inbox: 'Inbox', drafts: 'Drafts', sentitems: 'Sent Items', deleteditems: 'Deleted Items',
  junkemail: 'Junk Email', archive: 'Archive', outbox: 'Outbox',
};

function getFolderDisplayName(folderId: string, allFolders: Array<{ id: string; displayName: string }>): string {
  const key = folderId.toLowerCase().replace(/\s+/g, '');
  if (SYSTEM_FOLDER_LABELS[key]) return SYSTEM_FOLDER_LABELS[key];
  return allFolders.find((f) => f.id === folderId)?.displayName ?? 'Current Folder';
}

/** Finds a folder node (possibly nested) by id and returns its id plus every descendant id — used for "subfolders" search scope. */
function findFolderSubtreeIds(items: MailFolder[], targetId: string): string[] | null {
  for (const f of items) {
    if (f.id === targetId) return [f.id, ...flattenFolders(f.children ?? []).map((x) => x.id)];
    if (f.children) {
      const found = findFolderSubtreeIds(f.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

export function MailView({ isActive, onSyncStatusChange }: MailViewProps) {
  const { accounts, currentAccountIdx, setAccounts } = useAccountsStore();
  const { currentFolderId, setCurrentFolder, folders } = useFoldersStore();
  const { clearSelection } = useSelectionStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('Inbox');
  const allFolders = flattenFolders(folders);
  const [showCompose, setShowCompose] = useState(false);
  const [showSigManager, setShowSigManager] = useState(false);
  const [showRulesManager, setShowRulesManager] = useState(false);
  const [moveModalIds, setMoveModalIds] = useState<string[] | null>(null);

  // Infinite messages query
  const {
    data,
    isLoading,
    isFetchingNextPage,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ['messages', account?.id, currentFolderId],
    queryFn: ({ pageParam }) =>
      fetchMessages({
        folderId: currentFolderId,
        accountIdx: currentAccountIdx,
        token: account?.accessToken || '',
        nextLink: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage['@odata.nextLink'] ?? undefined,
    enabled: !!account,
  });

  // Flatten pages
  const folderMessages: Message[] = (data?.pages ?? []).flatMap((p) => p.value ?? []);
  const folderNextLink = data?.pages[data.pages.length - 1]?.['@odata.nextLink'] ?? null;

  // Search — scope-aware (all folders / current folder / subfolders / a specific folder),
  // ported from searchMail() in New-mailbox.html.
  const search = useSearchStore();
  const searchQuery = useQuery({
    queryKey: ['search', account?.id, search.query, search.scope],
    queryFn: async () => {
      if (!account) return [] as Message[];
      const folderNameMap = new Map(allFolders.map((f) => [f.id, f.displayName]));
      let results: Message[];

      if (search.scope.type === 'current') {
        results = (await searchMessagesInFolder(currentFolderId, search.query, account.accessToken, currentAccountIdx)).value ?? [];
      } else if (search.scope.type === 'folder' && search.scope.folderId) {
        results = (await searchMessagesInFolder(search.scope.folderId, search.query, account.accessToken, currentAccountIdx)).value ?? [];
      } else if (search.scope.type === 'subfolders') {
        const ids = findFolderSubtreeIds(folders, currentFolderId) ?? [currentFolderId];
        const perFolder = await Promise.all(
          ids.map((id) => searchMessagesInFolder(id, search.query, account.accessToken, currentAccountIdx).then((r) => r.value ?? []).catch(() => []))
        );
        results = perFolder.flat()
          .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())
          .slice(0, 50);
      } else {
        results = (await searchMessages(search.query, account.accessToken, currentAccountIdx)).value ?? [];
      }

      // Folder-name badges only make sense when results can span multiple folders.
      if (search.scope.type === 'all' || search.scope.type === 'subfolders') {
        results = results.map((m) => (m.parentFolderId && folderNameMap.has(m.parentFolderId)) ? { ...m, folderName: folderNameMap.get(m.parentFolderId) } : m);
      }
      return results;
    },
    enabled: !!account && search.isSearchActive && !!search.query,
  });

  const searchScopeLabel = search.scope.folderName
    ?? (search.scope.type === 'current' ? getFolderDisplayName(currentFolderId, allFolders)
      : search.scope.type === 'subfolders' ? `Subfolders of ${getFolderDisplayName(currentFolderId, allFolders)}`
        : 'All Folders');

  const messages: Message[] = search.isSearchActive ? (searchQuery.data ?? []) : folderMessages;
  const nextLink = search.isSearchActive ? null : folderNextLink;
  const isSearchLoading = search.isSearchActive && searchQuery.isLoading;
  const searchError = search.isSearchActive ? (searchQuery.error as Error | null) : null;

  // Selected message index (for navigation)
  const selectedIdx = messages.findIndex((m) => m.id === selectedMessageId);

  // Live sync (paused while another app tab is active)
  useLiveSync({
    account,
    accountIdx: currentAccountIdx,
    currentFolderId,
    allFolders,
    enabled: isActive,
    onNewMessages: (newMsgs) => {
      queryClient.invalidateQueries({ queryKey: ['messages', account?.id, currentFolderId] });
      if (newMsgs.length === 1) toast(`New: ${newMsgs[0].subject || '(No subject)'}`, 'info');
      else toast(`${newMsgs.length} new messages`, 'info');
      onSyncStatusChange(`Synced ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    },
  });

  // Bulk action events
  useEffect(() => {
    async function onBulkMarkRead(e: Event) {
      const ids = (e as CustomEvent).detail as string[];
      if (!account || ids.length === 0) return;
      toast(`Marking ${ids.length} messages as read...`);
      await Promise.allSettled(ids.map((id) => markMessageRead(id, true, account.accessToken, currentAccountIdx)));
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast('Messages marked as read', 'success');
    }
    async function onBulkDelete(e: Event) {
      const ids = (e as CustomEvent).detail as string[];
      if (!account || ids.length === 0) return;
      const isTrash = currentFolderId === 'deleteditems';
      if (isTrash) {
        if (!confirm(`Permanently delete ${ids.length} messages?`)) return;
        toast(`Permanently deleting ${ids.length} messages...`);
        await Promise.allSettled(ids.map((id) => permanentDeleteMessage(id, account.accessToken, currentAccountIdx)));
      } else {
        if (!confirm(`Move ${ids.length} messages to Deleted Items?`)) return;
        toast(`Moving ${ids.length} messages to trash...`);
        await Promise.allSettled(ids.map((id) => moveMessage(id, 'deleteditems', account.accessToken, currentAccountIdx)));
      }
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast(isTrash ? 'Messages permanently deleted' : 'Messages moved to Deleted Items', 'success');
    }
    function onBulkMove(e: Event) {
      const ids = (e as CustomEvent).detail as string[];
      if (ids.length === 0) return;
      setMoveModalIds(ids);
    }
    window.addEventListener('outlook:bulk-mark-read', onBulkMarkRead);
    window.addEventListener('outlook:bulk-delete', onBulkDelete);
    window.addEventListener('outlook:bulk-move', onBulkMove);
    return () => {
      window.removeEventListener('outlook:bulk-mark-read', onBulkMarkRead);
      window.removeEventListener('outlook:bulk-delete', onBulkDelete);
      window.removeEventListener('outlook:bulk-move', onBulkMove);
    };
  }, [account, currentAccountIdx, currentFolderId, clearSelection, queryClient, toast]);

  // ==================== ACTIONS ====================

  function handleFolderSelect(folderId: string, name: string) {
    setCurrentFolder(folderId);
    setFolderName(name);
    setSelectedMessageId(null);
    clearSelection();
  }

  function handleMessageSelect(msg: Message) {
    setSelectedMessageId(msg.id);
    // Optimistically mark read in cache
    if (!msg.isRead) {
      queryClient.setQueryData(['messages', account?.id, currentFolderId], (old: typeof data) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            value: page.value.map((m: Message) => m.id === msg.id ? { ...m, isRead: true } : m),
          })),
        };
      });
      // Fire-and-forget API call
      if (account) markMessageRead(msg.id, true, account.accessToken, currentAccountIdx).catch(() => {});
    }
  }

  function handleNavigate(dir: -1 | 1) {
    const newIdx = selectedIdx + dir;
    if (newIdx >= 0 && newIdx < messages.length) {
      setSelectedMessageId(messages[newIdx].id);
    }
  }

  async function handleDelete(id: string) {
    if (!account) return;
    const isTrash = currentFolderId === 'deleteditems';
    try {
      if (isTrash) {
        await permanentDeleteMessage(id, account.accessToken, currentAccountIdx);
      } else {
        await deleteMessage(id, account.accessToken, currentAccountIdx);
      }
      setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast(isTrash ? 'Message permanently deleted' : 'Message deleted', 'success');
    } catch (e) {
      toast('Delete failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleMarkRead(id: string, isRead: boolean) {
    if (!account) return;
    try {
      await markMessageRead(id, isRead, account.accessToken, currentAccountIdx);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleFlag(id: string) {
    if (!account) return;
    const msg = messages.find((m) => m.id === id);
    const isFlagged = msg?.flag?.flagStatus === 'flagged';
    try {
      await flagMessage(id, !isFlagged, account.accessToken, currentAccountIdx);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast(isFlagged ? 'Flag removed' : 'Message flagged', 'success');
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  function handleMove(id: string) {
    setMoveModalIds([id]);
  }

  async function performMove(destFolderId: string, destFolderName: string) {
    if (!account || !moveModalIds || moveModalIds.length === 0) return;
    const ids = moveModalIds;
    setMoveModalIds(null);
    try {
      await Promise.allSettled(ids.map((id) => moveMessage(id, destFolderId, account.accessToken, currentAccountIdx)));
      if (ids.includes(selectedMessageId || '')) setSelectedMessageId(null);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast(`Moved ${ids.length} message${ids.length !== 1 ? 's' : ''} to ${destFolderName}`, 'success');
    } catch (e) {
      toast('Move failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleLoadAll() {
    toast('Loading all messages...', 'info');
    while (hasNextPage) {
      await fetchNextPage();
    }
  }

  async function handleExportAddresses() {
    if (!account) { toast('No account selected', 'error'); return; }
    toast('Starting export...', 'info');
    try {
      if (hasNextPage) await handleLoadAll();
      const count = exportFolderAddresses(account, currentFolderId, messages);
      toast(`Exported ${count} email addresses`, 'success');
    } catch (e) {
      toast('Export failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleExportFullMailbox() {
    if (!account) { toast('No account selected', 'error'); return; }
    toast('Exporting email addresses from full mailbox...', 'info');
    try {
      const { addressCount, folderCount } = await exportFullMailboxAddresses(account, currentAccountIdx, (folderNm, count) => {
        onSyncStatusChange(`Exporting ${folderNm}: ${count} msgs...`);
      });
      onSyncStatusChange('Live sync active');
      toast(`Exported ${addressCount} email addresses from ${folderCount} folders`, 'success');
    } catch (e) {
      onSyncStatusChange('Export failed');
      toast('Export failed: ' + (e as Error).message, 'error');
    }
  }

  function handleExportDatabase() {
    exportAccountsDatabase(accounts);
    toast(`Database exported (${accounts.length} accounts)`, 'success');
  }

  function handleImportDatabase(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const { accounts: merged, imported, updated } = importAccountsDatabase(ev.target?.result as string, accounts);
        setAccounts(merged);
        const parts: string[] = [];
        if (imported > 0) parts.push(`${imported} imported`);
        if (updated > 0) parts.push(`${updated} updated`);
        toast(`Database loaded: ${parts.join(', ') || 'no changes'}`, 'success');
      } catch (err) {
        toast('Failed to read database file: ' + (err as Error).message, 'error');
      }
    };
    reader.readAsText(file);
  }

  const dbImportInputRef = useRef<HTMLInputElement>(null);

  // Panel widths (resizable — Phase 6+)
  const [folderWidth] = useState(220);
  const [listWidth] = useState(340);

  return (
    <>
    <div className="mail-view">
      {/* Folder Sidebar */}
      <div style={{ width: folderWidth, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        {/* New Mail + action buttons */}
        <div style={{ padding: '10px 12px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            className="toolbar-btn primary"
            style={{ flex: 1 }}
            onClick={() => setShowCompose(true)}
            id="newMailBtn"
          >
            <MailAddIcon size={15} style={{ fill: '#fff' }} />
            New Message
          </button>
          <button className="toolbar-btn" onClick={() => setShowSigManager(true)} title="Signatures" id="signaturesBtn">
            <SignatureIcon size={15} />
          </button>
          <button className="toolbar-btn" onClick={() => setShowRulesManager(true)} title="Rules" id="rulesBtn">
            <FilterIcon size={15} />
          </button>
        </div>

        {/* Load All / Export / Backup / DB import-export */}
        <div style={{ padding: '8px 12px', display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="toolbar-btn" onClick={handleLoadAll} title="Load All">
            <ArrowDownloadIcon size={15} />
          </button>
          <button className="toolbar-btn" onClick={handleExportAddresses} title="Export folder's email addresses">
            <ArrowUploadIcon size={15} />
          </button>
          <button className="toolbar-btn" onClick={handleExportFullMailbox} title="Full Backup (export addresses from every folder)">
            <CloudIcon size={15} />
          </button>
          <button className="toolbar-btn" onClick={handleExportDatabase} title="Export accounts database for backup">
            <DatabaseIcon size={15} />
          </button>
          <button className="toolbar-btn" onClick={() => dbImportInputRef.current?.click()} title="Import accounts database from backup">
            <ArrowDownloadIcon size={15} />
          </button>
          <input ref={dbImportInputRef} type="file" accept=".m365db,.json" style={{ display: 'none' }} onChange={handleImportDatabase} />
        </div>

        <FolderSidebar onFolderSelect={handleFolderSelect} />
      </div>

      {/* Column resizer (Phase 6) */}
      <div className="col-resizer" />

      {/* Message List */}
      <div style={{ width: listWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
        {/* Folder title bar */}
        <div className="message-list-header">
          <div className="message-list-title-row">
            <h3 id="folderTitle">
              {search.isSearchActive ? `Search in ${searchScopeLabel}: "${search.query}"` : folderName}
            </h3>
            <span className="message-count" id="messageCount">
              {search.isSearchActive
                ? `${messages.length} result${messages.length !== 1 ? 's' : ''}`
                : `${messages.length}${hasNextPage ? '+' : ''} message${messages.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {(search.isSearchActive || search.showFilterBar) && (
          <div className="search-filter-bar" id="searchFilterBar">
            <span className="search-filter-bar-label">Refine results:</span>
            {([
              ['hasAttachments', 'Has attachments'],
              ['unread', 'Unread'],
              ['toMe', 'To me'],
              ['flagged', 'Flagged'],
              ['highImportance', 'High importance'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`filter-chip${search.activeFilters.has(key) ? ' active' : ''}`}
                onClick={() => search.toggleFilter(key)}
              >{label}</button>
            ))}
            <button
              type="button"
              className="filter-chip"
              disabled
              title="Not available: Microsoft Graph only exposes @mention data via its beta API, which this app doesn't otherwise use."
            >Mentions me</button>
          </div>
        )}

        <MessageList
          onSelect={handleMessageSelect}
          selectedId={selectedMessageId}
          messages={messages}
          nextLink={nextLink}
          isLoading={isLoading || isFetchingNextPage || isSearchLoading}
          error={(error as Error | null) ?? searchError}
          onLoadMore={() => { if (hasNextPage) fetchNextPage(); }}
        />
      </div>

      {/* Column resizer (Phase 6) */}
      <div className="col-resizer" />

      {/* Reading Pane */}
      <ReadingPane
        messageId={selectedMessageId}
        messages={messages}
        selectedIdx={selectedIdx}
        onNavigate={handleNavigate}
        onDelete={handleDelete}
        onMarkRead={handleMarkRead}
        onFlag={handleFlag}
        onMove={handleMove}
        onClose={() => setSelectedMessageId(null)}
      />
    </div>

    {/* Compose window (floating) */}
    {showCompose && <ComposeWindow onClose={() => setShowCompose(false)} />}

    {/* Signature Manager modal */}
    {showSigManager && <SignatureManager onClose={() => setShowSigManager(false)} />}

    {/* Rules Manager modal */}
    {showRulesManager && <RulesManager onClose={() => setShowRulesManager(false)} />}

    {/* Move-to-folder picker */}
    {moveModalIds && (
      <div className="modal-overlay" onClick={() => setMoveModalIds(null)}>
        <div className="modal" style={{ width: 320, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Move {moveModalIds.length} message{moveModalIds.length !== 1 ? 's' : ''}</h2>
            <button className="modal-close" onClick={() => setMoveModalIds(null)}>
              <DismissIcon size={18} />
            </button>
          </div>
          <div className="modal-body" style={{ overflowY: 'auto', padding: '4px 0' }}>
            {allFolders.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No folders available</p>
            ) : allFolders.map((f) => (
              <button
                key={f.id}
                className="folder-item"
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={() => performMove(f.id, f.displayName)}
              >
                <span className="name">{f.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
