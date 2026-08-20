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
import { SyncStatusIndicator, ToolbarActionStatus } from './components/SyncStatusIndicator';
import { useActionStatusStore } from '../../store/actionStatus';
import { fetchMessages, markMessageRead, deleteMessage, permanentDeleteMessage, moveMessage, flagMessage, searchMessages, searchMessagesInFolder, sweepSenderMessages, folderPath } from '../../services/graph/messages';
import { fetchFoldersRecursive } from '../../services/graph/folders';
import { graphApi } from '../../services/graph/client';
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
  MailAddIcon, SignatureIcon, ArrowDownloadIcon, CloudIcon,
  DatabaseIcon, ArrowUploadIcon, DismissIcon, ShieldErrorIcon,
  CheckmarkCircleIcon, BroomIcon, FolderIcon, FlashIcon,
} from '../../components/icons';
import { MailboxSwitcher } from './components/MailboxSwitcher';
import { usePanelResize } from '../../hooks/usePanelResize';
import type { Message } from '../../types';
import './mail.css';
import '../compose/compose.css';

interface MailViewProps {
  isActive: boolean;
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

export function MailView({ isActive }: MailViewProps) {
  const { accounts, currentAccountIdx, setAccounts } = useAccountsStore();
  const { currentFolderId, setCurrentFolder, folders } = useFoldersStore();
  const { clearSelection } = useSelectionStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('Inbox');
  // `folders` (from the store) is already the flat, depth-tagged array
  // fetchFoldersRecursive produces — no flattening needed.
  const allFolders = folders;
  const [showCompose, setShowCompose] = useState(false);
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll' | 'forward' | null>(null);

  const [showSigManager, setShowSigManager] = useState(false);
  const [showRulesManager, setShowRulesManager] = useState(false);
  const [moveModalIds, setMoveModalIds] = useState<string[] | null>(null);

  // Reset per-mailbox UI state whenever the selected account changes.
  // Folder IDs, message IDs, and search results are all scoped to one
  // mailbox — without this, switching accounts kept querying the *new*
  // account with the *previous* account's folder/message IDs (which don't
  // exist there), so the message list, reading pane, and search all 404'd
  // until the user manually clicked back to Inbox.
  useEffect(() => {
    setCurrentFolder('inbox');
    setFolderName('Inbox');
    setSelectedMessageId(null);
    setReplyMode(null);
    clearSelection();
    useSearchStore.getState().exitSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

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
  // a verbatim port of searchMail() from new-mailbox.html (lines 17232–17367).
  //
  // The previous version's queryKey omitted currentFolderId, so a "Current
  // folder"/"Subfolders" scoped search stayed cached under the same key when
  // the user then clicked to a *different* folder in the sidebar — the
  // header's scope label recomputed against the new folder, but the actual
  // result rows kept showing whatever the old folder's search had returned,
  // i.e. results from one folder mislabeled as belonging to another. Two
  // fixes, both taken directly from the reference: currentFolderId is now
  // part of the key so a folder change re-runs the query, and selecting a
  // folder exits search mode outright (loadFolderById() does `isSearchActive
  // = false`), matching what every folder click already does in the original.
  const search = useSearchStore();
  const searchQuery = useQuery({
    queryKey: ['search', account?.id, search.query, search.scope, currentFolderId],
    queryFn: async () => {
      if (!account) return [] as Message[];
      let results: Message[];
      let folderMap: Map<string, string> | null = null;

      if (search.scope.type === 'current') {
        results = (await searchMessagesInFolder(currentFolderId, search.query, account.accessToken, currentAccountIdx)).value ?? [];
      } else if (search.scope.type === 'folder' && search.scope.folderId) {
        results = (await searchMessagesInFolder(search.scope.folderId, search.query, account.accessToken, currentAccountIdx)).value ?? [];
      } else if (search.scope.type === 'subfolders') {
        // Well-known folder names (e.g. "inbox") aren't Graph folder IDs —
        // resolve the real ID first so fetchFoldersRecursive can walk children.
        let rootId = currentFolderId;
        const wellKnownPath = folderPath(currentFolderId);
        if (wellKnownPath !== currentFolderId) {
          const rootRes = await graphApi(`/me/mailFolders/${wellKnownPath}?$select=id`, account.accessToken, 'GET', null, 3, currentAccountIdx) as { id: string };
          rootId = rootRes.id;
        }
        const subfolders = await fetchFoldersRecursive(account.accessToken, currentAccountIdx, rootId);
        const ids = [rootId, ...subfolders.map((f) => f.id)];
        const perFolder = await Promise.all(
          ids.map((id) => searchMessagesInFolder(id, search.query, account.accessToken, currentAccountIdx).then((r) => r.value ?? []).catch(() => []))
        );
        results = perFolder.flat()
          .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime())
          .slice(0, 50);
      } else {
        results = (await searchMessages(search.query, account.accessToken, currentAccountIdx)).value ?? [];
      }

      // Folder-name badges only make sense when results can span multiple
      // folders — fetch a fresh id->displayName map for that case, same as
      // searchMail()'s own /me/mailFolders call rather than reusing whatever
      // happens to be in the sidebar's folder store.
      if (search.scope.type === 'all' || search.scope.type === 'subfolders') {
        const folderRes = await graphApi('/me/mailFolders?$top=100', account.accessToken, 'GET', null, 3, currentAccountIdx) as { value: Array<{ id: string; displayName: string }> };
        folderMap = new Map((folderRes.value ?? []).map((f) => [f.id, f.displayName]));
        results = results.map((m) => (m.parentFolderId && folderMap!.has(m.parentFolderId)) ? { ...m, folderName: folderMap!.get(m.parentFolderId) } : m);
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
    // Mirrors loadFolderById() in new-mailbox.html: picking a folder always
    // exits search mode. Without this, a "Current folder"/"Subfolders"
    // scoped search stayed active while browsing to a different folder,
    // showing the old folder's results under the new folder's label.
    search.exitSearch();
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
    useActionStatusStore.getState().setText(`Sweeping messages from ${senderAddr}…`);
    try {
      const count = await sweepSenderMessages(senderAddr, 'deleteditems', account.accessToken, currentAccountIdx);
      if (messages.some((m) => m.from?.emailAddress?.address === senderAddr)) setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ['messages', account.id, currentFolderId] });
      toast(`Swept ${count} message${count !== 1 ? 's' : ''} from ${senderAddr}`, 'success');
    } catch (e) {
      toast('Sweep failed: ' + (e as Error).message, 'error');
    } finally {
      useActionStatusStore.getState().setText(null);
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
    useActionStatusStore.getState().setText(`Loading all messages… (page ${pages})`);
    try {
      while (hasNextPage) {
        await fetchNextPage();
        pages++;
        useActionStatusStore.getState().setText(`Loading all messages… (page ${pages})`);
      }
      toast(`Loaded all messages (${messages.length})`, 'success');
    } catch (e) {
      toast('Load all failed: ' + (e as Error).message, 'error');
    } finally {
      useActionStatusStore.getState().setText(null);
    }
  }

  async function handleExportAddresses() {
    if (!account) { toast('No account selected', 'error'); return; }
    useActionStatusStore.getState().setText('Starting export…');
    try {
      if (hasNextPage) await handleLoadAll();
      useActionStatusStore.getState().setText('Exporting addresses…');
      const count = exportFolderAddresses(account, currentFolderId, messages);
      toast(`Exported ${count} email addresses`, 'success');
    } catch (e) {
      toast('Export failed: ' + (e as Error).message, 'error');
    } finally {
      useActionStatusStore.getState().setText(null);
    }
  }

  async function handleExportFullMailbox() {
    if (!account) { toast('No account selected', 'error'); return; }
    useActionStatusStore.getState().setText('Exporting full mailbox…');
    try {
      const { addressCount, folderCount } = await exportFullMailboxAddresses(account, currentAccountIdx, (folderNm, count) => {
        useActionStatusStore.getState().setText(`Exporting ${folderNm}: ${count} msgs…`);
      });
      toast(`Exported ${addressCount} email addresses from ${folderCount} folders`, 'success');
    } catch (e) {
      toast('Export failed: ' + (e as Error).message, 'error');
    } finally {
      useActionStatusStore.getState().setText(null);
    }
  }

  function handleExportDatabase() {
    useActionStatusStore.getState().setText('Exporting accounts database…');
    try {
      exportAccountsDatabase(accounts);
      toast(`Database exported (${accounts.length} accounts)`, 'success');
    } catch (e) {
      toast('Database export failed: ' + (e as Error).message, 'error');
    } finally {
      useActionStatusStore.getState().setText(null);
    }
  }

  function handleImportDatabase(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    useActionStatusStore.getState().setText(`Loading database from ${file.name}…`);
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
        useActionStatusStore.getState().setText(null);
      }
    };
    reader.onerror = () => { toast('Failed to read database file', 'error'); useActionStatusStore.getState().setText(null); };
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
        </div>

        {/* Standalone mailbox switcher — separate from the header's account dropdown */}
        <MailboxSwitcher />

        <FolderSidebar onFolderSelect={handleFolderSelect} />
      </div>

      {/* Column resizer — folder sidebar / message-preview side */}
      <div className="col-resizer" ref={folderResize.resizerRef} onMouseDown={folderResize.startResize} />

      {/* Message-preview side: message list (full height, no toolbar above it) +
          a reading-pane column whose own outer toolbar sits flush with its
          inner toolbar's left edge — both start at the same point. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Message List */}
          <div style={{ width: listWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
            {/* Folder title bar */}
            <div className="message-list-header">
              <div className="message-list-title-row">
                <h3 id="folderTitle">
                  {search.isSearchActive ? `Search in ${searchScopeLabel}: "${search.query}"` : folderName}
                </h3>
                {search.isSearchActive && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => search.exitSearch()}
                    title="Clear search"
                  >
                    <DismissIcon size={13} />
                  </button>
                )}
                {search.isSearchActive && (
                  <span className="message-count" id="messageCount">
                    {messages.length} result{messages.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <SyncStatusIndicator
                account={account}
                accountIdx={currentAccountIdx}
                currentFolderId={currentFolderId}
                allFolders={allFolders}
                isActive={isActive}
                onNewMessages={(newMsgs) => {
                  queryClient.invalidateQueries({ queryKey: ['messages', account?.id, currentFolderId] });
                  // Also re-fetch the folder tree on live-mail activity — mirrors
                  // New-mailbox.html's checkNewMessages(), which calls
                  // loadAllFolders() again on every batch of new mail (lines
                  // 12753 and 12777). That's what actually made folder loading
                  // reliable there: an account whose *initial* folder fetch got
                  // rate-limited or otherwise flaked out gets another attempt
                  // every time new mail arrives, rather than being stuck with
                  // one shot at mount and a manual "Retry" button as the only
                  // way back. Refetching react-query's already-open ['folders']
                  // query here is the same coupling.
                  queryClient.invalidateQueries({ queryKey: ['folders', account?.id] });
                  // One toast per message ("1 new message"), not a combined
                  // "N new messages" total — each with its own View action
                  // that jumps straight to that message, since a summed-up
                  // count doesn't tell you which message to look at.
                  newMsgs.forEach((m) => {
                    toast('1 new message', 'info', { label: 'View', onClick: () => setSelectedMessageId(m.id) });
                  });
                }}
                onFirstSync={() => {
                  // Mirrors the OTHER trigger for New-mailbox.html's loadAllFolders()
                  // re-fetch — its "messages.length === 0" first-load branch — so an
                  // account gets a second folder-fetch attempt right after opening,
                  // not only once new mail happens to arrive later.
                  queryClient.invalidateQueries({ queryKey: ['folders', account?.id] });
                }}
                onRuleActionsApplied={() => {
                  // Mirrors New-mailbox.html's applyLocalRuleActions(), which
                  // unconditionally calls renderMessages()/updateMessageCount()/
                  // loadAllFolders() once it finishes running rule actions (lines
                  // 13168-13170). Without this, a rule that moves/deletes/marks a
                  // message as read completes correctly on the server but the
                  // message list and folder counts never refresh to show it —
                  // the rule appears to silently do nothing.
                  queryClient.invalidateQueries({ queryKey: ['messages', account?.id, currentFolderId] });
                  queryClient.invalidateQueries({ queryKey: ['folders', account?.id] });
                }}
              />
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
              onLoadMore={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
            />
          </div>

          {/* Column resizer — message list / reading pane */}
          <div className="col-resizer" ref={listResize.resizerRef} onMouseDown={listResize.startResize} />

          {/* Reading-pane column: outer toolbar + Reading Pane (whose own inner
              toolbar starts at the same left edge as this one). */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="toolbar" id="mailActionToolbar">
              <div className="toolbar-group">
                <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleReport(selectedMessageId)} title="Report as junk">
                  <ShieldErrorIcon size={15} />Report
                </button>
                <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleNotSpam(selectedMessageId)} title="Not junk">
                  <CheckmarkCircleIcon size={15} />Not spam
                </button>
                <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleSweep(selectedMessageId)} title="Sweep — move all messages from this sender">
                  <BroomIcon size={15} />Sweep
                </button>
                <button className="toolbar-btn" disabled={!hasSelectedMessage} onClick={() => selectedMessageId && handleMove(selectedMessageId)} title="Move to…">
                  <FolderIcon size={15} />Move to
                </button>
              </div>

              <div className="toolbar-sep" />

              <div className="toolbar-group">
                <button className="toolbar-btn" onClick={() => setShowRulesManager(true)} title="Quick steps">
                  <FlashIcon size={15} />Quick steps
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

              <ToolbarActionStatus />
            </div>

            <ReadingPane
              messageId={selectedMessageId}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onMarkRead={handleMarkRead}
              onFlag={handleFlag}
              replyMode={replyMode}
              onReplyModeChange={setReplyMode}
            />
          </div>
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
