/**
 * OneDriveView — file browser with upload, create folder, download, delete, search, quota.
 *
 * Ported from loadOneDrive() / renderOneDriveFiles() at lines 13820–14100.
 */

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccountsStore } from '../../store/accounts';
import {
  listDriveItems,
  uploadDriveFile,
  createDriveFolder,
  deleteDriveItem,
  getDriveQuota,
  searchDriveItems,
} from '../../services/graph/onedrive';
import { useToast } from '../../app/providers/ToastProvider';
import { getFileExtension, getFileIconClass } from '../../utils/format';
import './onedrive.css';

interface BreadcrumbEntry { id: string; name: string; }

export function OneDriveView() {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([{ id: 'root', name: 'My Drive' }]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const currentFolderId = breadcrumb[breadcrumb.length - 1]?.id ?? 'root';

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['onedrive', account?.id, currentFolderId, isSearchMode ? searchQuery : null],
    queryFn: () => {
      if (!account) return [];
      if (isSearchMode && searchQuery.trim()) {
        return searchDriveItems(searchQuery, account.accessToken, currentAccountIdx);
      }
      return listDriveItems(currentFolderId, account.accessToken, currentAccountIdx);
    },
    enabled: !!account,
    staleTime: 60_000,
  });

  const { data: quota } = useQuery({
    queryKey: ['onedrive-quota', account?.id],
    queryFn: () => account ? getDriveQuota(account.accessToken, currentAccountIdx) : null,
    enabled: !!account,
    staleTime: 5 * 60_000,
  });

  function navigateInto(item: { id: string; name: string }) {
    setBreadcrumb((prev) => [...prev, { id: item.id, name: item.name }]);
    setIsSearchMode(false);
  }

  function navigateTo(idx: number) {
    setBreadcrumb((prev) => prev.slice(0, idx + 1));
    setIsSearchMode(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !account) return;
    toast(`Uploading ${files.length} file(s)…`);
    try {
      await Promise.all(Array.from(files).map((f) =>
        uploadDriveFile(currentFolderId, f, account.accessToken, currentAccountIdx)
      ));
      qc.invalidateQueries({ queryKey: ['onedrive', account.id, currentFolderId] });
      toast('Upload complete', 'success');
    } catch (err) {
      toast('Upload failed: ' + (err as Error).message, 'error');
    }
    e.target.value = '';
  }

  async function handleCreateFolder() {
    if (!account || !newFolderName.trim()) return;
    try {
      await createDriveFolder(currentFolderId, newFolderName.trim(), account.accessToken, currentAccountIdx);
      qc.invalidateQueries({ queryKey: ['onedrive', account.id, currentFolderId] });
      setNewFolderName('');
      setShowNewFolder(false);
      toast('Folder created', 'success');
    } catch (err) {
      toast('Failed: ' + (err as Error).message, 'error');
    }
  }

  async function handleDelete(item: { id: string; name: string }) {
    if (!account || !confirm(`Delete "${item.name}"?`)) return;
    try {
      await deleteDriveItem(item.id, account.accessToken, currentAccountIdx);
      qc.invalidateQueries({ queryKey: ['onedrive', account.id, currentFolderId] });
      toast(`"${item.name}" deleted`, 'success');
    } catch (err) {
      toast('Delete failed: ' + (err as Error).message, 'error');
    }
  }

  function formatSize(bytes?: number): string {
    if (bytes === undefined || bytes === null) return '';
    if (bytes === 0) return '0 B';
    const units = ['B','KB','MB','GB'];
    let i = 0; let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function formatQuota(q?: { used?: number; total?: number } | null): string {
    if (!q?.total) return '';
    const pct = Math.round(((q.used ?? 0) / q.total) * 100);
    return `${formatSize(q.used)} of ${formatSize(q.total)} used (${pct}%)`;
  }

  return (
    <div className="onedrive-view" id="oneDriveView">
      {/* Toolbar */}
      <div className="calendar-toolbar">
        <button className="toolbar-btn primary" onClick={() => fileInputRef.current?.click()}>
          <svg viewBox="0 0 24 24" width={14} height={14} style={{ fill: '#fff' }}><path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
          Upload
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
        <button className="toolbar-btn" onClick={() => setShowNewFolder(true)}>
          <svg viewBox="0 0 24 24" width={14} height={14} style={{ fill: 'currentColor' }}><path d="M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm0 12H4V8h16v10zm-8-3.5V16l4-4-4-4v2.5L9 10v1.5l3-.5v2z" /></svg>
          New Folder
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            className="compose-field-input"
            style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', width: 180, fontSize: 12 }}
            placeholder="Search Drive…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setIsSearchMode(true); }}
          />
          <button className="toolbar-btn" onClick={() => setIsSearchMode(true)}>Search</button>
          {isSearchMode && <button className="toolbar-btn" onClick={() => { setSearchQuery(''); setIsSearchMode(false); }}>Clear</button>}
        </div>
      </div>

      {/* New folder form */}
      {showNewFolder && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 16px', background: 'var(--surface-alt)', borderBottom: '1px solid var(--border-light)' }}>
          <input className="compose-field-input" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px' }}
            value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }} />
          <button className="modal-btn primary" onClick={handleCreateFolder}>Create</button>
          <button className="modal-btn secondary" onClick={() => setShowNewFolder(false)}>Cancel</button>
        </div>
      )}

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 16px', fontSize: 13, borderBottom: '1px solid var(--border-light)' }}>
        {breadcrumb.map((bc, i) => (
          <span key={bc.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span style={{ color: 'var(--text-muted)' }}>›</span>}
            <button
              style={{ background: 'transparent', border: 'none', cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default', color: i < breadcrumb.length - 1 ? 'var(--primary)' : 'var(--text)', fontWeight: i === breadcrumb.length - 1 ? 600 : 400, fontSize: 13 }}
              onClick={() => i < breadcrumb.length - 1 && navigateTo(i)}
            >
              {bc.name}
            </button>
          </span>
        ))}
        {isSearchMode && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>— Search: "{searchQuery}"</span>}
      </div>

      {/* Quota bar */}
      {quota && (
        <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--primary)', width: `${Math.min(100, Math.round(((quota.used ?? 0) / (quota.total ?? 1)) * 100))}%` }} />
          </div>
          {formatQuota(quota as { used?: number; total?: number })}
        </div>
      )}

      {/* File list */}
      <div className="onedrive-file-list" id="oneDriveFileList">
        {!account && <div className="message-list-empty">No account selected</div>}
        {isLoading && <div className="message-list-loading">Loading files…</div>}
        {error && <div className="message-list-empty" style={{ color: 'var(--error)' }}>Failed to load files</div>}
        {!isLoading && items.length === 0 && account && (
          <div className="message-list-empty">
            {isSearchMode ? `No results for "${searchQuery}"` : 'This folder is empty'}
          </div>
        )}
        {items.map((item) => {
          const isFolder = !!item.folder;
          const iconClass = isFolder ? 'folder' : getFileIconClass(getFileExtension(item.name));
          return (
            <div key={item.id} className="file-item">
              <div className={`file-icon ${iconClass}`}>
                {isFolder ? (
                  <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z" /></svg>
                )}
              </div>
              <div className="file-info" onClick={() => isFolder && navigateInto(item)} style={{ cursor: isFolder ? 'pointer' : 'default' }}>
                <div className="file-name">{item.name}</div>
                <div className="file-meta">
                  {isFolder ? `${item.folder?.childCount ?? 0} items` : formatSize(item.size)}
                  {item.lastModifiedDateTime && ` · ${new Date(item.lastModifiedDateTime).toLocaleDateString()}`}
                </div>
              </div>
              <div className="file-actions">
                {!isFolder && item['@microsoft.graph.downloadUrl'] && (
                  <a href={item['@microsoft.graph.downloadUrl']} download={item.name} className="file-action-btn" title="Download">
                    <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                  </a>
                )}
                <button className="file-action-btn danger" onClick={() => handleDelete(item)} title="Delete">
                  <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
