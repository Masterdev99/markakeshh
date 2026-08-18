/**
 * Reading Pane — displays a selected email with full header, body, attachments,
 * and the inline reply/forward panel.
 *
 * Ported from displayEmail() at lines 9740–10100, openMessage() at 9420–9465,
 * patchCidImages() via useCidImagePatch hook.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccountsStore } from '../../../store/accounts';
import { fetchMessage, fetchAttachments } from '../../../services/graph/messages';
import { sanitizeHtml } from '../../../utils/sanitize';
import { formatFullDate, formatFileSize, base64ToBlob, getFileExtension, getFileIconClass } from '../../../utils/format';
import { getInitials, getAvatarColor } from '../../../utils/avatar';
import { useCidImagePatch, applyCidPatch } from '../hooks/useCidImagePatch';
import {
  DismissIcon, ArrowLeftIcon, ArrowRightIcon, SearchIcon, ReplyIcon, ReplyAllIcon,
  ForwardIcon, DeleteIcon, CheckmarkCircleIcon, FlagIcon, FolderIcon, AttachIcon, DocumentIcon,
  PdfIcon, DocumentTableIcon, SlideTextIcon, FolderZipIcon, ImageIcon,
} from '../../../components/icons';
import type { Message, Attachment } from '../../../types';
import { ReplyPanel } from './ReplyPanel';

const ATTACHMENT_ICONS: Record<string, typeof DocumentIcon> = {
  pdf: PdfIcon,
  xls: DocumentTableIcon,
  ppt: SlideTextIcon,
  zip: FolderZipIcon,
  img: ImageIcon,
};

function AttachmentTypeIcon({ fileClass, size }: { fileClass: string; size: number }) {
  const Icon = ATTACHMENT_ICONS[fileClass] || DocumentIcon;
  return <Icon size={size} />;
}

type ReplyMode = 'reply' | 'replyAll' | 'forward' | null;

interface ReadingPaneProps {
  messageId: string | null;
  messages: Message[];
  selectedIdx: number;
  onNavigate: (dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  onMarkRead: (id: string, isRead: boolean) => void;
  onFlag: (id: string) => void;
  onMove: (id: string) => void;
  onClose: () => void;
  /** Controlled from MailView so the new message-preview-side toolbar's Reply/Reply All/Forward buttons can drive the same panel. */
  replyMode: ReplyMode;
  onReplyModeChange: (mode: ReplyMode) => void;
}

export function ReadingPane({
  messageId, messages, selectedIdx, onNavigate, onDelete, onMarkRead, onFlag, onMove, onClose,
  replyMode, onReplyModeChange,
}: ReadingPaneProps) {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const getCidMap = useCidImagePatch();
  const [cidPatchedHtml, setCidPatchedHtml] = useState<string | null>(null);

  const { data: message, isLoading: msgLoading, error: msgError } = useQuery({
    queryKey: ['message', account?.id, messageId],
    queryFn: () => {
      if (!account || !messageId) return null;
      return fetchMessage(messageId, account.accessToken, currentAccountIdx);
    },
    enabled: !!account && !!messageId,
    staleTime: 60_000,
  });

  const { data: attachments = [], isLoading: attLoading } = useQuery({
    queryKey: ['attachments', account?.id, messageId],
    queryFn: () => {
      if (!account || !messageId || !message?.hasAttachments) return [];
      return fetchAttachments(messageId, account.accessToken, currentAccountIdx);
    },
    enabled: !!account && !!messageId && !!message?.hasAttachments,
  });

  const bodyHtml = message?.body?.content
    ? (message.body.contentType === 'html' ? sanitizeHtml(message.body.content) : `<pre style="white-space:pre-wrap;font-family:inherit">${message.body.content}</pre>`)
    : '';

  // Resolve CID images into React state — never mutate the rendered DOM
  // directly (see useCidImagePatch's doc comment for why that silently
  // reverted and made images "disappear after a while").
  useEffect(() => {
    setCidPatchedHtml(null);
    if (!message || !messageId || !bodyHtml.includes('cid:')) return;
    let cancelled = false;
    getCidMap(messageId, currentAccountIdx, bodyHtml).then((map) => {
      if (cancelled || Object.keys(map).length === 0) return;
      setCidPatchedHtml(applyCidPatch(bodyHtml, map));
    });
    return () => { cancelled = true; };
  }, [message, messageId, currentAccountIdx, bodyHtml, getCidMap]);

  if (!messageId) {
    return (
      <div className="reading-pane">
        <div className="reading-pane-empty" id="readingPaneEmpty">
          <svg viewBox="0 0 24 24" width={64} height={64}>
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>Select a message to read</div>
        </div>
      </div>
    );
  }

  const from = message?.from?.emailAddress;
  const initials = getInitials(from?.name || from?.address || '?');
  const avatarColor = getAvatarColor(from?.address || '');
  const renderedBodyHtml = cidPatchedHtml ?? bodyHtml;

  const recipients = [
    message?.toRecipients?.length ? 'To: ' + message.toRecipients.map((r) => r.emailAddress.name || r.emailAddress.address).join(', ') : null,
    message?.ccRecipients?.length ? 'Cc: ' + message.ccRecipients.map((r) => r.emailAddress.name || r.emailAddress.address).join(', ') : null,
  ].filter(Boolean);

  const canNavigateUp = selectedIdx > 0;
  const canNavigateDown = selectedIdx < messages.length - 1;

  function handleDownload(att: Attachment) {
    if (!att.contentBytes) return;
    const blob = base64ToBlob(att.contentBytes, att.contentType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = att.name; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="reading-pane" id="readingPane">
      <div className="email-view" id="emailView">
        {/* Email nav bar: Close/Previous/Next/Search */}
        <div className="email-toolbar">
          <button className="email-toolbar-btn" onClick={onClose} title="Close">
            <DismissIcon size={16} />
            Close
          </button>
          <button className="email-nav-btn" disabled={!canNavigateUp} onClick={() => onNavigate(-1)} title="Previous">
            <ArrowLeftIcon size={16} />
          </button>
          <button className="email-nav-btn" disabled={!canNavigateDown} onClick={() => onNavigate(1)} title="Next">
            <ArrowRightIcon size={16} />
          </button>
          <div className="email-toolbar-spacer" />
          <button className="email-pane-search-btn" title="Search in email">
            <SearchIcon size={16} />
          </button>
        </div>

        {/* Email action toolbar */}
        <div className="email-toolbar">
          <button className="email-toolbar-btn" onClick={() => onReplyModeChange('reply')} title="Reply">
            <ReplyIcon size={16} />
            Reply
          </button>
          <button className="email-toolbar-btn" onClick={() => onReplyModeChange('replyAll')} title="Reply All">
            <ReplyAllIcon size={16} />
            Reply All
          </button>
          <button className="email-toolbar-btn" onClick={() => onReplyModeChange('forward')} title="Forward">
            <ForwardIcon size={16} />
            Forward
          </button>
          <div className="email-toolbar-sep" />
          <button className="email-toolbar-btn" onClick={() => messageId && onDelete(messageId)} title="Delete">
            <DeleteIcon size={16} />
            Delete
          </button>
          <button className="email-toolbar-btn" onClick={() => messageId && onMarkRead(messageId, !message?.isRead)} title="Mark as read/unread">
            <CheckmarkCircleIcon size={16} />
            {message?.isRead ? 'Mark unread' : 'Mark read'}
          </button>
          <button className="email-toolbar-btn" onClick={() => messageId && onFlag(messageId)} title="Flag">
            <FlagIcon size={16} />
            {message?.flag?.flagStatus === 'flagged' ? 'Unflag' : 'Flag'}
          </button>
          <button className="email-toolbar-btn" onClick={() => messageId && onMove(messageId)} title="Move">
            <FolderIcon size={16} />
            Move
          </button>
        </div>

        {msgLoading ? (
          <div className="message-list-loading">Loading message...</div>
        ) : msgError ? (
          <div className="message-list-empty" style={{ color: 'var(--error)' }}>Failed to load message</div>
        ) : message ? (
          <>
            {/* Email header */}
            <div className="email-header" id="emailHeader">
              <div className="email-subject" id="emailSubject">{message.subject || '(No subject)'}</div>
              <div className="email-meta-row">
                <div className="email-sender-avatar" style={{ background: avatarColor }}>{initials}</div>
                <div className="email-sender-info">
                  <div className="email-sender-name" id="emailFrom">
                    {from?.name && from.name !== from.address ? (
                      <>{from.name}<span className="email-sender-address-inline">&lt;{from.address}&gt;</span></>
                    ) : (from?.address || 'Unknown')}
                  </div>
                  {recipients.map((r, i) => (
                    <div key={i} className="email-recipients">{r}</div>
                  ))}
                </div>
                <div className="email-date" id="emailDate">{formatFullDate(message.receivedDateTime)}</div>
              </div>
            </div>

            {/* Scrollable body container — hidden while replying/forwarding so the
                reply panel becomes the single full-height scroll region instead of
                splitting the pane into two independently-scrolling halves. The
                original message is still shown, quoted, inside the reply panel. */}
            {!replyMode && (
              <div className="email-body-container" id="emailBodyContainer">
                {/* Attachments — shown above the body so they're seen before scrolling into long messages */}
                {(message.hasAttachments && attachments.length > 0) && (
                  <div className="attachments-section" id="attachmentsSection">
                    <div className="attachments-header">
                      <AttachIcon size={14} />
                      {attachments.filter((a) => !a.isInline).length} attachment(s)
                    </div>
                    <div className="attachments-list" id="attachmentsList">
                      {attachments.filter((a) => !a.isInline).map((att) => {
                        const fileClass = getFileIconClass(getFileExtension(att.name));
                        return (
                          <button key={att.id} className="attachment-chip" onClick={() => handleDownload(att)}>
                            <span className={`attachment-chip-icon ${fileClass}`}>
                              <AttachmentTypeIcon fileClass={fileClass} size={16} />
                            </span>
                            <span>{att.name}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(att.size)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {attLoading && message.hasAttachments && (
                  <div className="attachments-section">
                    <div className="attachments-header">
                      <div className="shimmer" style={{ width: 120, height: 14 }} />
                    </div>
                  </div>
                )}

                {/* Email body */}
                <div
                  id="emailBody"
                  className="email-body"
                  dangerouslySetInnerHTML={{ __html: renderedBodyHtml }}
                />
              </div>
            )}

            {/* Reply panel — fills the pane at full height with one scroll region */}
            {replyMode && (
              <ReplyPanel
                message={message}
                mode={replyMode}
                onClose={() => onReplyModeChange(null)}
              />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
