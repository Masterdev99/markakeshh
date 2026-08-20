/**
 * Folder Sidebar — renders the full folder tree with system folders,
 * custom folders, expand/collapse, unread badges, and ⋮ menu.
 *
 * Ported from renderFolderSidebar() and related functions at lines 9016–9124.
 */

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccountsStore } from '../../../store/accounts';
import { useFoldersStore } from '../../../store/folders';
import { fetchFoldersRecursive, createFolder } from '../../../services/graph/folders';
import { useToast } from '../../../app/providers/ToastProvider';
import { Modal } from '../../../components/Modal';
import {
  InboxIcon, DocumentIcon, ForwardIcon, DeleteIcon, WarningIcon, ArchiveIcon,
  FolderIcon as FolderGlyph, ChevronDownIcon, AddIcon, MoreHorizontalIcon, DismissIcon,
} from '../../../components/icons';
import type { MailFolder } from '../../../types';

// System folder names that appear in the fixed top section
const SYSTEM_FOLDER_NAMES = new Set([
  'inbox', 'drafts', 'sentitems', 'deleteditems', 'junkemail', 'archive', 'outbox',
]);

const HIDDEN_FOLDER_NAMES = new Set([
  'conversation history', 'sync issues', 'conflicts', 'local failures', 'server failures',
]);

const SYSTEM_FOLDER_ORDER = ['inbox', 'drafts', 'sentitems', 'deleteditems', 'junkemail', 'archive'];

const SYSTEM_LABELS: Record<string, string> = {
  inbox: 'Inbox', drafts: 'Drafts', sentitems: 'Sent Items',
  deleteditems: 'Deleted Items', junkemail: 'Junk Email', archive: 'Archive',
};

// Stable reference so useQuery's default doesn't create a new array every render
// (a fresh `[] `default would re-trigger the setFolders effect below in an infinite loop).
const EMPTY_FOLDERS: MailFolder[] = [];

interface FolderSidebarProps {
  onFolderSelect: (folderId: string, folderName: string) => void;
}

export function FolderSidebar({ onFolderSelect }: FolderSidebarProps) {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const { currentFolderId, expandedFolderIds, toggleFolderExpanded, setFolders } = useFoldersStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const [createTarget, setCreateTarget] = useState<{ parentId: string | null; parentLabel: string } | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const { data: folders = EMPTY_FOLDERS, error, isLoading, refetch } = useQuery({
    queryKey: ['folders', account?.id],
    queryFn: () => {
      if (!account) return EMPTY_FOLDERS;
      return fetchFoldersRecursive(account.accessToken, currentAccountIdx);
    },
    enabled: !!account,
    staleTime: 30_000,
  });

  useEffect(() => {
    setFolders(folders);
  }, [folders, setFolders]);

  // `folders` is already flat + depth-tagged, in depth-first fetch order
  // (see fetchFoldersRecursive). Verbatim port of renderFolderSidebar()'s
  // split from new-mailbox.html: system folders are depth-0 entries whose
  // name matches a well-known folder; everything else (minus a few hidden
  // technical folders) is "Other Folders".
  const systemFoldersByKey = new Map<string, MailFolder>();
  const otherFolders: MailFolder[] = [];
  for (const f of folders) {
    const key = f.displayName.toLowerCase().replace(/\s+/g, '');
    if (f.depth === 0 && SYSTEM_FOLDER_NAMES.has(key)) {
      systemFoldersByKey.set(key, f);
    } else {
      otherFolders.push(f);
    }
  }
  const displayFolders = otherFolders.filter((f) => !HIDDEN_FOLDER_NAMES.has(f.displayName.toLowerCase()));

  // Verbatim port of renderFolderSidebar()'s hiddenDepth trick: walking the
  // depth-first list, once a folder with children is collapsed, every
  // subsequent entry deeper than it is skipped until we come back up to its
  // depth or shallower.
  const customFolders: Array<MailFolder & { hasChildren: boolean; isExpanded: boolean }> = [];
  let hiddenDepth = Infinity;
  for (const f of displayFolders) {
    if (f.depth <= hiddenDepth) hiddenDepth = Infinity;
    if (hiddenDepth === Infinity) {
      const isExpanded = expandedFolderIds.has(f.id);
      const hasChildren = (f.childFolderCount ?? 0) > 0;
      customFolders.push({ ...f, hasChildren, isExpanded });
      if (hasChildren && !isExpanded) hiddenDepth = f.depth;
    }
  }

  function openCreateFolder(parentId: string | null, parentLabel: string) {
    setNewFolderName('');
    setCreateTarget({ parentId, parentLabel });
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name || !account || !createTarget) return;
    setCreating(true);
    try {
      const newFolder = await createFolder(name, account.accessToken, currentAccountIdx, createTarget.parentId ?? undefined);
      toast(`Folder "${newFolder.displayName}" created`, 'success');
      if (createTarget.parentId) toggleFolderExpanded(createTarget.parentId); // auto-expand parent
      queryClient.invalidateQueries({ queryKey: ['folders', account.id] });
      setCreateTarget(null);
    } catch (e) {
      toast('Failed to create folder: ' + (e as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
    <div className="folder-sidebar">
      {/* System folders */}
      <div className="folder-section">
        {SYSTEM_FOLDER_ORDER.map((key) => {
          const f = systemFoldersByKey.get(key);
          const label = SYSTEM_LABELS[key];
          const folderId = f?.id ?? key;
          const unread = f?.unreadItemCount ?? 0;
          const isActive = currentFolderId === folderId || currentFolderId === key;

          return (
            <div
              key={key}
              className={`folder-item${isActive ? ' active' : ''}`}
              data-folder={folderId}
              onClick={() => onFolderSelect(folderId, label)}
            >
              <FolderIcon name={key} />
              <span className="name">{label}</span>
              {unread > 0 && <span className="badge" id={`${key}Badge`}>{unread}</span>}
            </div>
          );
        })}
      </div>

      {/* Custom / Other folders */}
      {customFolders.length > 0 && (
        <div className="folder-section" id="customFolders">
          <div className="folder-section-title">
            Other Folders
            <button
              type="button"
              className="folder-section-add-btn"
              title="New folder"
              onClick={(e) => { e.stopPropagation(); openCreateFolder(null, 'top level'); }}
            >
              <AddIcon size={14} />
            </button>
          </div>

          {customFolders.map((f) => {
            const isActive = currentFolderId === f.id;

            return (
              <div
                key={f.id}
                className={`folder-item${isActive ? ' active' : ''}`}
                data-folder={f.id}
                style={{ paddingLeft: 10 + f.depth * 16 }}
                onClick={() => {
                  if (f.hasChildren) toggleFolderExpanded(f.id);
                  onFolderSelect(f.id, f.displayName);
                }}
              >
                {f.hasChildren ? (
                  <ChevronDownIcon
                    size={16}
                    className={`folder-chevron${f.isExpanded ? '' : ' collapsed'}`}
                    onClick={(e) => { e.stopPropagation(); toggleFolderExpanded(f.id); }}
                  />
                ) : (
                  <span style={{ width: 18, display: 'inline-block' }} />
                )}
                <FolderGlyph size={16} style={{ marginRight: 4, flexShrink: 0 }} />
                <span className="name">{f.displayName}</span>
                {f.unreadItemCount > 0 && <span className="badge">{f.unreadItemCount}</span>}
                <button
                  type="button"
                  className="folder-options-btn"
                  title="Folder options"
                  onClick={(e) => {
                    e.stopPropagation();
                    openCreateFolder(f.id, f.displayName);
                  }}
                >
                  <MoreHorizontalIcon size={16} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading and error states — previously a failed folder fetch (e.g. a
          throttled or permission-restricted account) left this panel showing
          only the fixed system-folder list with no indication that custom
          folders existed but failed to load, and no way to retry. */}
      {account && isLoading && (
        <div style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
          Loading folders…
        </div>
      )}
      {account && error && (
        <div style={{ padding: '10px 16px', fontSize: 12 }}>
          <div style={{ color: 'var(--error)', marginBottom: 6 }}>
            Couldn't load folders: {(error as Error).message}
          </div>
          <button type="button" className="folder-section-add-btn" style={{ width: 'auto', padding: '2px 8px' }} onClick={() => refetch()}>
            Retry
          </button>
        </div>
      )}

      {!account && (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Select an account to see folders
        </div>
      )}
    </div>

    {createTarget && (
      <Modal onClose={() => setCreateTarget(null)} style={{ width: 380, maxWidth: '92vw' }}>
        <div className="modal-header">
          <h2>New folder</h2>
          <button className="modal-close" onClick={() => setCreateTarget(null)}>
            <DismissIcon size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">
              {createTarget.parentId ? `Inside "${createTarget.parentLabel}"` : 'Top-level folder'}
            </label>
            <input
              className="form-input"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={() => setCreateTarget(null)}>Cancel</button>
          <button className="modal-btn primary" onClick={handleCreateFolder} disabled={!newFolderName.trim() || creating}>
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </Modal>
    )}
    </>
  );
}

const SYSTEM_FOLDER_ICONS: Record<string, typeof InboxIcon> = {
  inbox: InboxIcon,
  drafts: DocumentIcon,
  sentitems: ForwardIcon,
  deleteditems: DeleteIcon,
  junkemail: WarningIcon,
  archive: ArchiveIcon,
};

function FolderIcon({ name }: { name: string }) {
  const Icon = SYSTEM_FOLDER_ICONS[name] || FolderGlyph;
  return <Icon size={16} style={{ flexShrink: 0 }} />;
}
