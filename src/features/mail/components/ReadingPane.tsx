/**
 * Reading Pane — displays a selected email with full header, body, attachments,
 * and the inline reply/forward panel.
 *
 * Ported from displayEmail() at lines 9740–10100, openMessage() at 9420–9465,
 * patchCidImages() via useCidImagePatch hook.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccountsStore } from '../../../store/accounts';
import { fetchMessage, fetchAttachments } from '../../../services/graph/messages';
import { sanitizeHtml } from '../../../utils/sanitize';
import { formatFullDate, formatFileSize, formatRecipient, base64ToBlob, getFileExtension } from '../../../utils/format';
import { getInitials, getAvatarColor } from '../../../utils/avatar';
import { useCidImagePatch, applyCidPatch, blankCidRefs } from '../hooks/useCidImagePatch';
import {
  ReplyIcon, ReplyAllIcon, ForwardIcon, DeleteIcon, ArchiveIcon, CheckmarkCircleIcon,
  FlagIcon, AttachIcon, DocumentIcon,
} from '../../../components/icons';
import { FileTypeIcon, getFileIconKind } from '../../../components/fileTypeIcons';
import type { Attachment, Recipient } from '../../../types';
import { ReplyPanel } from './ReplyPanel';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';

const MAX_VISIBLE_RECIPIENTS = 3;

/** A To/Cc/Bcc line that collapses behind a "+N more" toggle once the recipient count is large enough that listing everyone would push the header height around unpredictably. */
function RecipientLine({ label, recipients }: { label: string; recipients: Recipient[] }) {
  const [expanded, setExpanded] = useState(false);
  if (recipients.length === 0) return null;
  const visible = expanded ? recipients : recipients.slice(0, MAX_VISIBLE_RECIPIENTS);
  const hiddenCount = recipients.length - visible.length;
  return (
    <div className="email-recipients">
      <span className="email-recipients-label">{label}: </span>
      {visible.map((r, i) => (
        <span key={i}>
          {formatRecipient(r.emailAddress)}
          {i < visible.length - 1 ? ', ' : ''}
        </span>
      ))}
      {hiddenCount > 0 && (
        <button type="button" className="email-recipients-more" onClick={() => setExpanded(true)}>
          +{hiddenCount} more
        </button>
      )}
      {expanded && recipients.length > MAX_VISIBLE_RECIPIENTS && (
        <button type="button" className="email-recipients-more" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}
    </div>
  );
}

/**
 * Splits a filename into a (possibly long) base and its extension, rendered
 * as two separate spans — the base truncates with an ellipsis via CSS as the
 * chip narrows, while the extension never shrinks. A single fixed-length JS
 * truncation couldn't guarantee this: on a narrow chip, CSS text-overflow
 * would still clip whatever it produced, extension included.
 */
function splitFileName(name: string): { base: string; ext: string } {
  const dotIdx = name.lastIndexOf('.');
  const hasExt = dotIdx > 0 && dotIdx < name.length - 1;
  return hasExt ? { base: name.slice(0, dotIdx), ext: name.slice(dotIdx) } : { base: name, ext: '' };
}

type ReplyMode = 'reply' | 'replyAll' | 'forward' | null;

interface ReadingPaneProps {
  messageId: string | null;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onMarkRead: (id: string, isRead: boolean) => void;
  onFlag: (id: string) => void;
  /** Controlled from MailView so the outer toolbar's Reply/Reply All/Forward buttons can drive the same panel. */
  replyMode: ReplyMode;
  onReplyModeChange: (mode: ReplyMode) => void;
}

export function ReadingPane({
  messageId, onDelete, onArchive, onMarkRead, onFlag,
  replyMode, onReplyModeChange,
}: ReadingPaneProps) {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const getCidMap = useCidImagePatch();
  // Tagged with the message id it was produced for, so a patch resolving
  // late (after the reader already moved on) is ignored rather than painted
  // over the new message — which is what the old unconditional
  // `setCidPatchedHtml(null)` reset in the effect below used to guard
  // against, at the cost of an extra innerHTML write on every effect run.
  const [cidPatched, setCidPatched] = useState<{ id: string; html: string } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

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

  // Memoized on the raw body only. sanitizeHtml is expensive, but the reason
  // this matters beyond cost is identity: recomputing it every render made it
  // an unstable dependency of the effect below, so unrelated re-renders (a
  // sync tick, a reply-panel toggle) re-ran the CID resolve and rewrote the
  // body's innerHTML. See the DOM-churn note on renderedBodyHtml.
  const bodyHtml = useMemo(() => {
    const content = message?.body?.content;
    if (!content) return '';
    return message?.body?.contentType === 'html'
      ? sanitizeHtml(content)
      : `<pre style="white-space:pre-wrap;font-family:inherit">${content}</pre>`;
  }, [message?.body?.content, message?.body?.contentType]);

  // Resolve CID images into React state — never mutate the rendered DOM
  // directly (see useCidImagePatch's doc comment for why that silently
  // reverted and made images "disappear after a while").
  //
  // Deliberately does NOT reset to null up front. Doing so rendered the
  // blanked body for a frame before the patched one landed, i.e. two
  // innerHTML writes per run instead of one. Because the resolved cid map is
  // cached at module scope, a re-run for the same message rebuilds a
  // *value-equal* string, which React's dangerouslySetInnerHTML compare then
  // skips entirely — no DOM write, so anything living in that subtree
  // (inline images, and the browser's own page translation) survives.
  useEffect(() => {
    if (!messageId || !bodyHtml.includes('cid:')) return;
    let cancelled = false;
    getCidMap(messageId, currentAccountIdx, bodyHtml).then((map) => {
      if (cancelled) return;
      // Always apply — even an empty map still needs to run so any cid: refs
      // that couldn't be resolved get blanked instead of left as a literal
      // cid: URL (which the browser can't fetch and shows as a broken image).
      setCidPatched({ id: messageId, html: applyCidPatch(bodyHtml, map) });
    });
    return () => { cancelled = true; };
  }, [messageId, currentAccountIdx, bodyHtml, getCidMap]);

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
  // Before the cid map resolves, blank any cid: refs rather than render them
  // raw — otherwise the browser attempts to fetch the literal `cid:` URL
  // (unsupported scheme) and shows a broken-image icon that then pops to a
  // real image once resolved, a visible double layout shift.
  // The id guard replaces the old null-reset: a patch left over from the
  // previously-read message simply doesn't match and is ignored, so switching
  // messages can't briefly show the wrong body.
  const renderedBodyHtml = (cidPatched?.id === messageId ? cidPatched.html : null) ?? blankCidRefs(bodyHtml);

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
        {/* Email action toolbar — scoped to the currently open message */}
        <div className="email-toolbar">
          <button className="email-toolbar-btn" onClick={() => messageId && onDelete(messageId)} title="Delete">
            <DeleteIcon size={16} />
            Delete
          </button>
          <button className="email-toolbar-btn" onClick={() => messageId && onArchive(messageId)} title="Archive">
            <ArchiveIcon size={16} />
            Archive
          </button>
          <div className="email-toolbar-sep" />
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
          <button className="email-toolbar-btn" onClick={() => messageId && onMarkRead(messageId, !message?.isRead)} title="Mark as read/unread">
            <CheckmarkCircleIcon size={16} />
            {message?.isRead ? 'Mark unread' : 'Mark read'}
          </button>
          <button className="email-toolbar-btn" onClick={() => messageId && onFlag(messageId)} title="Flag">
            <FlagIcon size={16} />
            {message?.flag?.flagStatus === 'flagged' ? 'Unflag' : 'Flag'}
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
                  <RecipientLine label="To" recipients={message.toRecipients || []} />
                  <RecipientLine label="Cc" recipients={message.ccRecipients || []} />
                  <RecipientLine label="Bcc" recipients={message.bccRecipients || []} />
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
                        const kind = getFileIconKind(getFileExtension(att.name));
                        const { base, ext } = splitFileName(att.name);
                        return (
                          <button key={att.id} className="attachment-chip" onClick={() => setPreviewAttachment(att)} title={att.name}>
                            <span className={`attachment-chip-icon${kind === 'other' ? ' other' : ''}`}>
                              {kind === 'other' ? <DocumentIcon size={16} /> : <FileTypeIcon kind={kind} size={20} />}
                            </span>
                            <span className="attachment-chip-info">
                              <span className="attachment-chip-name">
                                <span className="attachment-chip-name-base">{base}</span>
                                <span className="attachment-chip-name-ext">{ext}</span>
                              </span>
                              <span className="attachment-chip-size">{formatFileSize(att.size)}</span>
                            </span>
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

      {previewAttachment && (
        <AttachmentPreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}
