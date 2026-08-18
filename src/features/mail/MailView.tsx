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
import { fetchMessages, markMessageRead, deleteMessage, permanentDeleteMessage, moveMessage, flagMessage, searchMessages, searchMessagesInFolder, sweepSenderMessages } from '../../services/graph/messages';
import { mapWithConcurrency } from '../../utils/concurrency';

/** Caps simultaneous requests for multi-message toolbar actions (mark read/delete/move) so selecting hundreds of messages can't fire them all at once. */
const MAX_CONCURRENT_BULK_REQUESTS = 6;
import { useToast } from '../../app/providers/ToastProvider';
import { ComposeWindow } from '../compose/ComposeWindow';
import { SignatureManager } from '../signatures/SignatureManager';
import { RulesManager } from '../rules/RulesManager';
import { Modal } from '../../components/Modal';
import { exportFolderAddresses, exportFullMailboxAddresses, exportAccountsDatabase, importAccountsDatabase } from '../../services/export';
import {
  MailAddIcon, SignatureIcon, FilterIcon, ArrowDownloadIcon, CloudIcon,
  DatabaseIcon, ArrowUploadIcon, DismissIcon, DeleteIcon, ArchiveIcon, ShieldErrorIcon,
  CheckmarkCircleIcon, BroomIcon, FolderIcon, ReplyIcon, ReplyAllIcon, ForwardIcon,
  FlashIcon, MailReadIcon, MailUnreadIcon,
} from '../../components/icons';
import { MailboxSwitcher } from './components/MailboxSwitcher';
import { usePanelResize } from '../../hooks/usePanelResize';
import type { Message, MailFolder } from '../../types';
import './mail.css';
import '../compose/compose.css';

interface MailViewProps {
  isActive: boolean;
}

function timeAgoLabel(date: Date | null): string {
  if (!date) return '';
  const secs = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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

export function MailView({ isActive }: MailViewProps) {
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
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll' | 'forward' | null>(null);

  // Live sync status — shown as a small pill near the message list (never in
  // the blue header bar, which reads poorly against white text) and updated
  // on every sync tick so it never sits static.
  const [syncState, setSyncState] = useState<'checking' | 'synced' | 'error'>('synced');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
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
    },
    onSyncTick: (state) => {
      setSyncState(state);
      if (state === 'synced') setLastSyncedAt(new Date());
    },
  });

  // Bulk action events
  useEffect(() => {
    async function onBulkMarkRead(e: Event) {
      const ids = (e as CustomEvent).detail as string[];
      if (!account || ids.length === 0) return;
      toast(`Marking ${ids.length} messages as read...`);
      await mapWithConcurrency(ids, MAX_CONCURRENT_BULK_REQUESTS, (id) => markMessageRead(id, true, account.accessToken, currentAccountIdx));
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
        await mapWithConcurrency(ids, MAX_CONCURRENT_BULK_REQUESTS, (id) => permanentDeleteMessage(id, account.accessToken, currentAccountIdx));
      } else {
        if (!confirm(`Move ${ids.length} messages to Deleted Items?`)) return;
        toast(`Moving ${ids.length} messages to trash...`);
        await mapWithConcurrency(ids, MAX_CONCURRENT_BULK_REQUESTS, (id) => moveMessage(id, 'deleteditems', account.accessToken, currentAccountIdx));
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
    setReplyMode(null);
    clearSelection();
  }

  function handleMessageSelect(msg: Message) {
    // Selecting/viewing a message must not mark it read — only an explicit
    // "Mark as read" action (handleMarkRead) may do that.
    setSelectedMessageId(msg.id);
    setReplyMode(null);
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

  async function handleArchive(id: string) {
    if (!account) return;
    try {
      await moveMessage(id, 'archive', account.accessToken, currentAccountIdx);
      if (id === selectedMessageId) setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast('Message archived', 'success');
    } catch (e) {
      toast('Archive failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleReport(id: string) {
    if (!account) return;
    try {
      await moveMessage(id, 'junkemail', account.accessToken, currentAccountIdx);
      if (id === selectedMessageId) setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast('Reported as junk', 'success');
    } catch (e) {
      toast('Report failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleNotSpam(id: string) {
    if (!account) return;
    try {
      await moveMessage(id, 'inbox', account.accessToken, currentAccountIdx);
      if (id === selectedMessageId) setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast('Moved back to Inbox', 'success');
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleSweep(id: string) {
    if (!account) return;
    const msg = messages.find((m) => m.id === id);
    const senderAddr = msg?.from?.emailAddress?.address;
    if (!senderAddr) { toast('Cannot sweep — sender address unknown', 'error'); return; }
    if (!confirm(`Move every message from ${senderAddr} to Deleted Items?`)) return;
    setStatusOverride(`Sweeping messages from ${senderAddr}…`);
    try {
      const count = await sweepSenderMessages(senderAddr, 'deleteditems', account.accessToken, currentAccountIdx);
      if (messages.some((m) => m.from?.emailAddress?.address === senderAddr)) setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast(`Swept ${count} message${count !== 1 ? 's' : ''} from ${senderAddr}`, 'success');
    } catch (e) {
      toast('Sweep failed: ' + (e as Error).message, 'error');
    } finally {
      setStatusOverride(null);
    }
  }

  async function performMove(destFolderId: string, destFolderName: string) {
    if (!account || !moveModalIds || moveModalIds.length === 0) return;
    const ids = moveModalIds;
    setMoveModalIds(null);
    try {
      await mapWithConcurrency(ids, MAX_CONCURRENT_BULK_REQUESTS, (id) => moveMessage(id, destFolderId, account.accessToken, currentAccountIdx));
      if (ids.includes(selectedMessageId || '')) setSelectedMessageId(null);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast(`Moved ${ids.length} message${ids.length !== 1 ? 's' : ''} to ${destFolderName}`, 'success');
    } catch (e) {
      toast('Move failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleLoadAll() {
    if (!hasNextPage) { toast('All messages already loaded', 'info'); return; }
    let pages = 1;
    setStatusOverride(`Loading all messages… (page ${pages})`);
    try {
      while (hasNextPage) {
        await fetchNextPage();
        pages++;
        setStatusOverride(`Loading all messages… (page ${pages})`);
      }
      toast(`Loaded all messages (${messages.length})`, 'success');
    } catch (e) {
      toast('Load all failed: ' + (e as Error).message, 'error');
    } finally {
      setStatusOverride(null);
    }
  }

  async function handleExportAddresses() {
    if (!account) { toast('No account selected', 'error'); return; }
    setStatusOverride('Starting export…');
    try {
      if (hasNextPage) await handleLoadAll();
      setStatusOverride('Exporting addresses…');
      const count = exportFolderAddresses(account, currentFolderId, messages);
      toast(`Exported ${count} email addresses`, 'success');
    } catch (e) {
      toast('Export failed: ' + (e as Error).message, 'error');
    } finally {
      setStatusOverride(null);
    }
  }

  async function handleExportFullMailbox() {
    if (!account) { toast('No account selected', 'error'); return; }
    setStatusOverride('Exporting full mailbox…');
    try {
      const { addressCount, folderCount } = await exportFullMailboxAddresses(account, currentAccountIdx, (folderNm, count) => {
        setStatusOverride(`Exporting ${folderNm}: ${count} msgs…`);
      });
      toast(`Exported ${addressCount} email addresses from ${folderCount} folders`, 'success');
    } catch (e) {
      toast('Export failed: ' + (e as Error).message, 'error');
    } finally {
      setStatusOverride(null);
    }
  }

  function handleExportDatabase() {
    setStatusOverride('Exporting accounts database…');
    try {
      exportAccountsDatabase(accounts);
      toast(`Database exported (${accounts.length} accounts)`, 'success');
    } catch (e) {
      toast('Database export failed: ' + (e as Error).message, 'error');
    } finally {
      setStatusOverride(null);
    }
  }

  function handleImportDatabase(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatusOverride(`Loading database from ${file.name}…`);
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
      } finally {
        setStatusOverride(null);
      }
    };
    reader.onerror = () => { toast('Failed to read database file', 'error'); setStatusOverride(null); };
    reader.readAsText(file);
  }

  const dbImportInputRef = useRef<HTMLInputElement>(null);

  // Panel widths — draggable via .col-resizer handles, wired below
  const [folderWidth, setFolderWidth] = useState(220);
  const [listWidth, setListWidth] = useState(340);
  const folderResize = usePanelResize({ minWidth: 140, maxWidth: 400, onResize: setFolderWidth });
  const listResize = usePanelResize({ minWidth: 220, maxWidth: 640, onResize: setListWidth });
  folderResize.setWidth(folderWidth);
  listResize.setWidth(listWidth);

  const hasSelectedMessage = !!selectedMessageId;
  const isJunkFolder = currentFolderId.toLowerCase().replace(/\s+/g, '') === 'junkemail';

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

        {/* Standalone mailbox switcher — separate from the header's account dropdown */}
        <MailboxSwitcher />

        <FolderSidebar onFolderSelect={handleFolderSelect} />
      </div>

      {/* Column resizer — folder sidebar / message-preview side */}
      <div className="col-resizer" ref={folderResize.resizerRef} onMouseDown={folderResize.startResize} />

      {/* Message-preview side: quick-action toolbar + message list + reading pane */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Quick-action toolbar — mirrors New-mailbox.html's ribbon toolbar, scoped
            to the message-preview side per explicit request (not above the folder sidebar). */}
        <div className="toolbar" id="mailActionToolbar">
          <div className="toolbar-group">
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleDelete(selectedMessageId)} title="Delete">
              <DeleteIcon size={15} />Delete
            </button>
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleArchive(selectedMessageId)} title="Archive">
              <ArchiveIcon size={15} />Archive
            </button>
            {isJunkFolder ? (
              <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleNotSpam(selectedMessageId)} title="Not junk">
                <CheckmarkCircleIcon size={15} />Not spam
              </button>
            ) : (
              <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleReport(selectedMessageId)} title="Report as junk">
                <ShieldErrorIcon size={15} />Report
              </button>
            )}
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleSweep(selectedMessageId)} title="Sweep — move all messages from this sender">
              <BroomIcon size={15} />Sweep
            </button>
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleMove(selectedMessageId)} title="Move to…">
              <FolderIcon size={15} />Move to
            </button>
          </div>

          <div className="toolbar-sep" />

          <div className="toolbar-group">
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => hasSelectedMessage && setReplyMode('reply')} title="Reply">
              <ReplyIcon size={15} />Reply
            </button>
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => hasSelectedMessage && setReplyMode('replyAll')} title="Reply all">
              <ReplyAllIcon size={15} />Reply all
            </button>
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => hasSelectedMessage && setReplyMode('forward')} title="Forward">
              <ForwardIcon size={15} />Forward
            </button>
            <button className="toolbar-btn" onClick={() => setShowRulesManager(true)} title="Quick steps">
              <FlashIcon size={15} />Quick steps
            </button>
          </div>

          <div className="toolbar-sep" />

          <div className="toolbar-group">
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleMarkRead(selectedMessageId, true)} title="Mark as read">
              <MailReadIcon size={15} />Mark as read
            </button>
            <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleMarkRead(selectedMessageId, false)} title="Mark as unread">
              <MailUnreadIcon size={15} />Mark as unread
            </button>
          </div>

          <div className="toolbar-spacer" />

          <div className="toolbar-group">
            <button className="toolbar-btn" onClick={handleLoadAll} title="Load all messages in this folder">
              <ArrowDownloadIcon size={15} />Load All
            </button>
            <button className="toolbar-btn" onClick={handleExportAddresses} title="Export this folder's email addresses">
              <ArrowUploadIcon size={15} />Export
            </button>
            <button className="toolbar-btn" onClick={handleExportFullMailbox} title="Full Backup — export addresses from every folder">
              <CloudIcon size={15} />Backup
            </button>
            <button className="toolbar-btn" onClick={handleExportDatabase} title="Export accounts database for backup">
              <DatabaseIcon size={15} />Save DB
            </button>
            <button className="toolbar-btn" onClick={() => dbImportInputRef.current?.click()} title="Import accounts database from backup">
              <ArrowDownloadIcon size={15} />Load DB
            </button>
            <input ref={dbImportInputRef} type="file" accept=".m365db,.json" style={{ display: 'none' }} onChange={handleImportDatabase} />
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
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
              <div className="sync-indicator" id="syncStatus" style={{ paddingRight: 0 }} title={lastSyncedAt ? `Last synced ${lastSyncedAt.toLocaleTimeString()}` : undefined}>
                {/* The dot spins during a "checking" tick, but the label always
                    shows the last refreshed state rather than flashing to a
                    "Syncing…" processing state on every 30s poll. */}
                <div className={`dot${statusOverride || syncState === 'checking' ? ' spinning' : syncState === 'error' ? ' error' : ''}`} />
                {statusOverride
                  ? statusOverride
                  : syncState === 'error' ? 'Sync error — retrying'
                    : lastSyncedAt ? `Synced ${timeAgoLabel(lastSyncedAt)}` : 'Live sync active'}
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

          {/* Column resizer — message list / reading pane */}
          <div className="col-resizer" ref={listResize.resizerRef} onMouseDown={listResize.startResize} />

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
            replyMode={replyMode}
            onReplyModeChange={setReplyMode}
          />
        </div>
      </div>
    </div>

    {/* Compose window (floating) */}
    {showCompose && <ComposeWindow onClose={() => setShowCompose(false)} />}

    {/* Signature Manager modal */}
    {showSigManager && <SignatureManager onClose={() => setShowSigManager(false)} />}

    {/* Rules Manager modal */}
    {showRulesManager && <RulesManager onClose={() => setShowRulesManager(false)} />}

    {/* Move-to-folder picker */}
    {moveModalIds && (
      <Modal onClose={() => setMoveModalIds(null)} style={{ width: 320, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
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
      </Modal>
    )}
    </>
  );
}
