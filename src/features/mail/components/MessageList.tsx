/**
 * Message List — renders grouped message rows with bulk selection.
 * Mirrors renderMessages() at lines 9277–9394.
 */

import { useEffect, useRef, useState } from 'react';
import { useSelectionStore } from '../../../store/selection';
import { useSearchStore } from '../../../store/search';
import { useAccountsStore } from '../../../store/accounts';
import { getInitials, getAvatarColor } from '../../../utils/avatar';
import { formatDate, getMessageGroup } from '../../../utils/format';
import { ChevronDownIcon, AttachIcon } from '../../../components/icons';
import type { Message } from '../../../types';

type MailTab = 'focused' | 'other';
type FilterType = 'all' | 'unread' | 'flagged' | 'attachments';

interface MessageListProps {
  onSelect: (message: Message) => void;
  selectedId: string | null;
  messages: Message[];
  nextLink: string | null;
  isLoading: boolean;
  error: Error | null;
  onLoadMore: () => void;
}

function isOther(m: Message): boolean {
  return (
    m.importance === 'low' ||
    (m.from?.emailAddress?.address || '').toLowerCase().includes('noreply')
  );
}

export function MessageList({
  onSelect, selectedId, messages, nextLink, isLoading, error, onLoadMore,
}: MessageListProps) {
  const [tab, setTab] = useState<MailTab>('focused');
  const [filter, setFilter] = useState<FilterType>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const { selectedIds, toggleSelection, selectAll, clearSelection } = useSelectionStore();
  const { isSearchActive, activeFilters } = useSearchStore();
  const { accounts, currentAccountIdx } = useAccountsStore();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextLink) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { rootMargin: '100px' }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [nextLink, onLoadMore]);

  // Filter messages — Focused/Other tab and the folder-view sort chips only
  // apply while browsing a folder; search has its own refinement chips below.
  let filtered = messages.filter((m) => {
    if (isSearchActive) return true;
    if (tab === 'other') return isOther(m);
    return !isOther(m);
  });

  if (!isSearchActive) {
    filtered = filtered.filter((m) => {
      if (filter === 'unread') return !m.isRead;
      if (filter === 'flagged') return m.flag?.flagStatus === 'flagged';
      if (filter === 'attachments') return m.hasAttachments;
      return true;
    });
  }

  if (isSearchActive && activeFilters.size > 0) {
    const myEmail = (currentAccountIdx >= 0 ? accounts[currentAccountIdx]?.email : '')?.toLowerCase() ?? '';
    filtered = filtered.filter((m) => {
      if (activeFilters.has('hasAttachments') && !m.hasAttachments) return false;
      if (activeFilters.has('unread') && m.isRead) return false;
      if (activeFilters.has('flagged') && m.flag?.flagStatus !== 'flagged') return false;
      if (activeFilters.has('highImportance') && m.importance !== 'high') return false;
      if (activeFilters.has('toMe')) {
        const toList = (m.toRecipients || []).map((r) => (r.emailAddress?.address || '').toLowerCase());
        if (!myEmail || !toList.includes(myEmail)) return false;
      }
      return true;
    });
  }

  // Group
  const groups = new Map<string, Message[]>();
  for (const msg of filtered) {
    const groupName = getMessageGroup(msg.receivedDateTime, msg.importance);
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(msg);
  }

  const hasSelection = selectedIds.size > 0;

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function handleBulkMarkRead() {
    // Handled in MailView via event
    window.dispatchEvent(new CustomEvent('outlook:bulk-mark-read', { detail: Array.from(selectedIds) }));
  }

  function handleBulkDelete() {
    window.dispatchEvent(new CustomEvent('outlook:bulk-delete', { detail: Array.from(selectedIds) }));
  }

  return (
    <div className="message-list-panel">
      {!isSearchActive && (
        <>
          {/* Tabs */}
          <div className="mail-tabs" id="messageListTabs">
            <button className={`msg-tab${tab === 'focused' ? ' active' : ''}`} onClick={() => setTab('focused')}>Focused</button>
            <button className={`msg-tab${tab === 'other' ? ' active' : ''}`} onClick={() => setTab('other')}>Other</button>
          </div>

          {/* Filter chips */}
          <div style={{ padding: '8px 16px 0', borderBottom: '1px solid var(--border-light)', background: 'var(--surface)' }}>
            <div className="filter-chips">
              {(['all', 'unread', 'flagged', 'attachments'] as FilterType[]).map((f) => (
                <button key={f} className={`filter-chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'flagged' ? 'Flagged' : 'Has attachment'}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bulk toolbar */}
      {hasSelection && (
        <div className="bulk-toolbar visible" id="bulkToolbar">
          <span className="bulk-count" id="bulkCount">{selectedIds.size} selected</span>
          <button className="bulk-btn" onClick={handleBulkMarkRead}>Mark read</button>
          <button className="bulk-btn danger" onClick={handleBulkDelete}>Delete</button>
          <button className="bulk-btn" onClick={() => window.dispatchEvent(new CustomEvent('outlook:bulk-move', { detail: Array.from(selectedIds) }))}>Move</button>
          <button className="bulk-btn" style={{ marginLeft: 'auto' }} onClick={clearSelection}>Clear</button>
        </div>
      )}

      {/* Message list */}
      <div className="message-list-content" id="messageListContent">
        {isLoading && messages.length === 0 ? (
          <div className="message-list-loading">Loading messages...</div>
        ) : error ? (
          <div className="message-list-empty" style={{ color: 'var(--error)' }}>{error.message}</div>
        ) : filtered.length === 0 ? (
          <div className="message-list-empty">No messages</div>
        ) : (
          Array.from(groups.entries()).map(([groupName, msgs]) => {
            const isCollapsed = collapsedGroups.has(groupName);
            return (
              <div key={groupName}>
                <div
                  className={`date-group-header${isCollapsed ? ' collapsed' : ''}`}
                  data-group={groupName}
                  onClick={() => toggleGroup(groupName)}
                >
                  <input
                    type="checkbox"
                    className="group-checkbox"
                    style={{ marginRight: 8, display: hasSelection ? 'inline-block' : 'none' }}
                    title={`Select all in ${groupName}`}
                    onChange={(e) => {
                      if (e.target.checked) selectAll([...Array.from(selectedIds), ...msgs.map((m) => m.id)]);
                      else { msgs.forEach((m) => selectedIds.has(m.id) && toggleSelection(m.id)); }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <ChevronDownIcon size={14} />
                  <span>{groupName}</span>
                </div>
                <div className={`date-group-content${isCollapsed ? ' collapsed' : ''}`}>
                  {msgs.map((msg) => (
                    <MessageRow
                      key={msg.id}
                      msg={msg}
                      isSelected={msg.id === selectedId}
                      isChecked={selectedIds.has(msg.id)}
                      groupName={groupName}
                      onSelect={() => onSelect(msg)}
                      onToggleCheck={() => toggleSelection(msg.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* Infinite scroll sentinel */}
        {nextLink && <div ref={sentinelRef} style={{ height: 20 }} id="infiniteScrollSentinel" />}
        {isLoading && messages.length > 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            <div className="sending-spinner" style={{ width: 20, height: 20, margin: '0 auto 8px' }} />
            Loading more messages...
          </div>
        )}
      </div>
    </div>
  );
}

interface MessageRowProps {
  msg: Message;
  isSelected: boolean;
  isChecked: boolean;
  groupName: string;
  onSelect: () => void;
  onToggleCheck: () => void;
}

function MessageRow({ msg, isSelected, isChecked, groupName, onSelect, onToggleCheck }: MessageRowProps) {
  const from = msg.from?.emailAddress;
  const initials = getInitials(from?.name || from?.address || '?');
  const color = getAvatarColor(from?.address || '');
  const isUnread = !msg.isRead;
  const date = formatDate(msg.receivedDateTime);

  return (
    <div
      className={`message-item${isUnread ? ' unread' : ''}${isSelected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <div className="msg-row-checkbox">
        <input
          type="checkbox"
          className="msg-checkbox"
          data-group-id={groupName}
          checked={isChecked}
          onChange={onToggleCheck}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="msg-row-avatar" style={{ background: color }}>{initials}</div>
      <div className="msg-row-subject-preview">
        <div className="msg-row-from">
          {from?.name || from?.address || 'Unknown'}
          {msg.folderName && <span className="msg-row-folder-badge">{msg.folderName}</span>}
        </div>
        <div className="msg-row-subject-line">
          <span className={`msg-row-subject-text${isUnread ? ' unread-subj' : ''}`}>
            {msg.subject || '(No subject)'}
          </span>
          {msg.hasAttachments && (
            <span title="Has attachments" style={{ display: 'inline-flex', flexShrink: 0 }}>
              <AttachIcon size={13} className="msg-row-attach-indicator" />
            </span>
          )}
          <span className="msg-row-date">{date}</span>
        </div>
        <span className="msg-row-preview-text">{msg.bodyPreview}</span>
      </div>
    </div>
  );
}
