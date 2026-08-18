/**
 * Reply Panel — inline reply/replyAll/forward editor.
 *
 * CRITICAL CONSTRAINTS (from react-migration-prompt.md):
 * - Single scroll container: the whole panel scrolls as one region, no nested
 *   scrollboxes (the editor's own `resize: vertical` is user-driven, not a
 *   second independent scroll region under normal use).
 * - CID images in the quoted "original message" are resolved via
 *   useCidImagePatch/applyCidPatch into local state, same as the main
 *   reading pane body — never via imperative DOM mutation (that was the
 *   cause of inline images loading and later disappearing).
 * - Uses native contenteditable + refs — no rich-text library.
 * - Cc/Bcc auto-populate from structured recipients AND from addresses only
 *   mentioned in the quoted/forwarded body text (extractAllMentionedEmails),
 *   merged into Cc for Reply All — this is regression #2 in the migration prompt.
 * - Signature dropdown reads the same shared store as SignatureManager/Compose
 *   (services/storage/signatures.ts) — never a separate copy (regression #1).
 *
 * Ported from openReplyPanel()/sendReply() and related functions, lines ~10085–10960.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useAccountsStore } from '../../../store/accounts';
import { loadSignatures } from '../../../services/storage/signatures';
import { getFromAlias, getReplyTo } from '../../../services/storage/identity';
import { createReply, createReplyAll, createForward, sendDraftMessage, updateDraftMessage } from '../../../services/graph/messages';
import { escHtml, sanitizeHtml } from '../../../utils/sanitize';
import { formatFullDate, formatRecipientList, getFileExtension } from '../../../utils/format';
import { getAvatarColor } from '../../../utils/avatar';
import { useToast } from '../../../app/providers/ToastProvider';
import { SignatureManager } from '../../signatures/SignatureManager';
import { DismissIcon, AttachIcon, LinkIcon, EmojiIcon, SendIcon } from '../../../components/icons';
import { useCidImagePatch, applyCidPatch, blankCidRefs } from '../hooks/useCidImagePatch';
import type { Message, Signature } from '../../../types';

interface ReplyPanelProps {
  message: Message;
  mode: 'reply' | 'replyAll' | 'forward';
  onClose: () => void;
}

interface ReplyAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
  size: number;
}

const REPLY_EMOJI_SET = [
  '😀', '😂', '😊', '😍', '🤔', '😅', '😉', '😢', '😎', '🙌',
  '👍', '👎', '🙏', '👏', '💪', '❤️', '🎉', '🔥', '✅', '⭐',
  '📌', '📎', '📅', '⏰', '😴', '🤝', '👋', '🚀', '💡', '☕',
];

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

/** Structured recipients + any addresses mentioned in the body text (quoted/forwarded chains). */
function extractAllMentionedEmails(message: Message): Set<string> {
  const found = new Set<string>();
  const add = (addr?: string) => { if (addr) found.add(addr.toLowerCase()); };
  (message.toRecipients || []).forEach((r) => add(r.emailAddress?.address));
  (message.ccRecipients || []).forEach((r) => add(r.emailAddress?.address));
  (message.bccRecipients || []).forEach((r) => add(r.emailAddress?.address));
  add(message.from?.emailAddress?.address);

  const raw = message.body?.content || message.bodyPreview || '';
  const text = raw.replace(/<[^>]*>/g, ' ');
  const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  (text.match(EMAIL_RE) || []).forEach((a) => add(a));
  return found;
}

function RecipientRow({ label, recipients, onRemove, onAdd, placeholder }: {
  label: string;
  recipients: string[];
  onRemove: (idx: number) => void;
  onAdd: (value: string) => void;
  placeholder: string;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="recipient-tags">
      {recipients.map((r, idx) => (
        <span className="recipient-tag" key={`${r}-${idx}`}>
          {r}
          <button type="button" className="recipient-tag-remove" onClick={() => onRemove(idx)}>×</button>
        </span>
      ))}
      <input
        type="text"
        className="recipient-input"
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const v = value.trim().replace(/,$/, '');
            if (v) { onAdd(v); setValue(''); }
          }
        }}
      />
    </div>
  );
}

export function ReplyPanel({ message, mode, onClose }: ReplyPanelProps) {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const getCidMap = useCidImagePatch();
  const [cidPatchedHistoryHtml, setCidPatchedHistoryHtml] = useState<string | null>(null);
  const { toast } = useToast();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);

  const [toRecipients, setToRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [bccRecipients, setBccRecipients] = useState<string[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState('');

  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [attachments, setAttachments] = useState<ReplyAttachment[]>([]);

  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [selectedSigName, setSelectedSigName] = useState('');
  const [showSigManager, setShowSigManager] = useState(false);

  const modeLabel = mode === 'reply' ? 'Reply' : mode === 'replyAll' ? 'Reply All' : 'Forward';

  function refreshSignatures(keepSelection = true) {
    const sigs = loadSignatures();
    setSignatures(sigs);
    setSelectedSigName((prev) => {
      if (keepSelection && sigs.some((s) => s.name === prev)) return prev;
      const def = sigs.find((s) => s.isDefault);
      return def ? def.name : '';
    });
  }

  // Reset + auto-populate recipients/subject whenever a new message/mode opens
  useEffect(() => {
    if (!account) return;
    const myEmail = account.email.toLowerCase();
    const from: { name?: string; address?: string } = message.from?.emailAddress || {};

    let to: string[] = [];
    let cc: string[] = [];
    let bcc: string[] = [];

    if (mode === 'reply' || mode === 'replyAll') {
      if (mode === 'reply') {
        if (from.address) to = [from.address];
      } else {
        const allTo = [from.address, ...(message.toRecipients || []).map((r) => r.emailAddress?.address)]
          .filter((a): a is string => !!a && a.toLowerCase() !== myEmail);
        to = [...new Set(allTo)];
      }

      const ccAddrs = (message.ccRecipients || [])
        .map((r) => r.emailAddress?.address)
        .filter((a): a is string => !!a && a.toLowerCase() !== myEmail);
      if (ccAddrs.length) cc = [...new Set(ccAddrs)];

      const bccAddrs = (message.bccRecipients || [])
        .map((r) => r.emailAddress?.address)
        .filter((a): a is string => !!a && a.toLowerCase() !== myEmail);
      if (bccAddrs.length) bcc = [...new Set(bccAddrs)];

      if (mode === 'replyAll') {
        const mentioned = extractAllMentionedEmails(message);
        const already = new Set([...to, ...cc, ...bcc, myEmail].filter(Boolean).map((a) => a.toLowerCase()));
        const extra = [...mentioned].filter((a) => !already.has(a));
        if (extra.length) cc = [...new Set([...cc, ...extra])];
      }

      setSubject((message.subject?.startsWith('Re:') ? '' : 'Re: ') + (message.subject || ''));
    } else {
      setSubject((message.subject?.startsWith('Fw:') || message.subject?.startsWith('FW:') ? '' : 'Fw: ') + (message.subject || ''));
    }

    setToRecipients(to);
    setCcRecipients(cc);
    setBccRecipients(bcc);
    setShowCc(cc.length > 0);
    setShowBcc(bcc.length > 0);
    setAttachments([]);
    refreshSignatures(false);

    if (editorRef.current) {
      editorRef.current.innerHTML = '<br>';
      setTimeout(() => editorRef.current?.focus(), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, mode, account]);

  function execFormat(command: string, value?: string) {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    setShowFormatMenu(false);
  }

  function insertLink() {
    const url = prompt('Enter URL (include https://):');
    if (!url) return;
    editorRef.current?.focus();
    document.execCommand('createLink', false, url);
  }

  function insertEmoji(emoji: string) {
    editorRef.current?.focus();
    document.execCommand('insertText', false, emoji);
    setShowEmojiMenu(false);
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) { toast(`File too large: ${file.name} (max 25 MB)`, 'error'); continue; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        const contentBytes = dataUrl.slice(dataUrl.indexOf(',') + 1);
        setAttachments((prev) => [...prev, { name: file.name, contentType: file.type || 'application/octet-stream', contentBytes, size: file.size }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }

  // Embeds an image attachment inline at the cursor and removes it from the
  // attachment list so it isn't ALSO sent as a separate file attachment.
  function insertAttachmentIntoBody(idx: number) {
    const att = attachments[idx];
    if (!att) return;
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const img = document.createElement('img');
    img.src = `data:${att.contentType};base64,${att.contentBytes}`;
    img.alt = att.name;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
    } else {
      editor.appendChild(img);
    }
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
    toast('Image inserted into message body', 'success');
  }

  const selectedSig = signatures.find((s) => s.name === selectedSigName);

  async function handleSend() {
    if (!account) return;
    if (toRecipients.length === 0) {
      toast(mode === 'forward' ? 'Enter a recipient to forward to' : 'Recipient is required', 'error');
      return;
    }
    setSending(true);

    try {
      const replyToAddr = getReplyTo(account.email);
      const fromAlias = getFromAlias(account.email);

      let draft: Message;
      if (mode === 'reply') draft = await createReply(message.id, account.accessToken, currentAccountIdx);
      else if (mode === 'replyAll') draft = await createReplyAll(message.id, account.accessToken, currentAccountIdx);
      else draft = await createForward(message.id, account.accessToken, currentAccountIdx);

      const userHtml = editorRef.current?.innerHTML.trim() ?? '';
      const sigHtml = selectedSig?.content || '';
      const from = message.from?.emailAddress;
      const quotedHtml =
        `<div style="border-left:1.5px solid #c8c6c4;padding-left:12px;margin:16px 0 0 0;color:#605E5C;font-family:inherit">` +
        `<p style="margin:0 0 6px 0;font-size:12px;color:#8A8886">` +
        `<b>From:</b> ${from?.name && from.name !== from.address ? `${escHtml(from.name)} &lt;${escHtml(from.address || '')}&gt;` : escHtml(from?.address || '')}<br>` +
        `<b>Sent:</b> ${escHtml(formatFullDate(message.receivedDateTime))}<br>` +
        `<b>To:</b> ${escHtml(formatRecipientList(message.toRecipients))}<br>` +
        `<b>Subject:</b> ${escHtml(message.subject || '')}` +
        `</p>` +
        (message.body?.contentType === 'html' ? (message.body?.content || '') : `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px">${escHtml(message.body?.content || message.bodyPreview || '')}</pre>`) +
        `</div>`;

      const fullHtml =
        `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px">` +
        userHtml +
        (sigHtml ? `<div style="margin-top:12px;border-top:1px solid #ccc;padding-top:12px;font-size:12px;color:#666">${sigHtml}</div>` : '') +
        `<br>` + quotedHtml +
        `</div>`;

      const payload: Record<string, unknown> = {
        subject,
        body: { contentType: 'HTML', content: fullHtml },
        toRecipients: toRecipients.map((a) => ({ emailAddress: { address: a.trim() } })),
      };
      if (ccRecipients.length > 0) payload.ccRecipients = ccRecipients.map((a) => ({ emailAddress: { address: a.trim() } }));
      if (bccRecipients.length > 0) payload.bccRecipients = bccRecipients.map((a) => ({ emailAddress: { address: a.trim() } }));
      if (attachments.length > 0) {
        payload.attachments = attachments.map((a) => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.contentBytes,
        }));
      }
      if (replyToAddr) {
        payload.replyTo = [{ emailAddress: { address: replyToAddr, name: fromAlias || account.displayName || '' } }];
      }

      await updateDraftMessage(draft.id, payload, account.accessToken, currentAccountIdx);
      await sendDraftMessage(draft.id, account.accessToken, currentAccountIdx);

      toast('Message sent', 'success');
      onClose();
    } catch (e) {
      toast('Send failed: ' + (e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  const from = message.from?.emailAddress;
  const historyDate = formatFullDate(message.receivedDateTime);
  const historySender = from?.name || from?.address || 'Unknown';
  const historyInitials = historySender.split(' ').map((p) => p[0]).join('').substring(0, 2).toUpperCase();
  const historyBodyRaw = message.body?.content || message.bodyPreview || '';
  const historyBody = message.body?.contentType === 'html' ? sanitizeHtml(historyBodyRaw) : historyBodyRaw;
  const renderedHistoryBody = cidPatchedHistoryHtml ?? blankCidRefs(historyBody);

  // Resolve CID images in the quoted original message — shares the module-level
  // cache in useCidImagePatch with the main reading pane, so this is a cache
  // hit (no extra fetch) whenever that pane already resolved the same message.
  useEffect(() => {
    setCidPatchedHistoryHtml(null);
    if (!historyBody.includes('cid:')) return;
    let cancelled = false;
    getCidMap(message.id, currentAccountIdx, historyBody).then((map) => {
      if (cancelled) return;
      setCidPatchedHistoryHtml(applyCidPatch(historyBody, map));
    });
    return () => { cancelled = true; };
  }, [message.id, currentAccountIdx, historyBody, getCidMap]);

  return (
    <div className="reply-panel" id="replyPanel" onClick={() => { setShowFormatMenu(false); setShowEmojiMenu(false); }}>
      <div className="reply-panel-header">
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{modeLabel}</span>
        <button className="reply-panel-close" onClick={onClose} title="Discard">
          <DismissIcon size={18} />
        </button>
      </div>

      {/* Compact To/Cc/Bcc/Subject fields */}
      <div className="reply-compact-fields">
        <div className="reply-compact-row">
          <span className="reply-compact-row-label">To</span>
          <div className="reply-compact-row-body">
            <RecipientRow
              label="To"
              recipients={toRecipients}
              placeholder="Add recipient..."
              onRemove={(idx) => setToRecipients((prev) => prev.filter((_, i) => i !== idx))}
              onAdd={(v) => setToRecipients((prev) => [...prev, v])}
            />
          </div>
          <div className="reply-cc-bcc-links">
            <button type="button" className={`reply-cc-toggle${showCc ? ' active' : ''}`} onClick={() => setShowCc((v) => !v)}>Cc</button>
            <button type="button" className={`reply-bcc-toggle${showBcc ? ' active' : ''}`} onClick={() => setShowBcc((v) => !v)}>Bcc</button>
          </div>
        </div>

        <div className={`reply-compact-row${showCc ? '' : ' hidden'}`}>
          <span className="reply-compact-row-label">Cc</span>
          <div className="reply-compact-row-body">
            <RecipientRow
              label="Cc"
              recipients={ccRecipients}
              placeholder="Add Cc recipient..."
              onRemove={(idx) => setCcRecipients((prev) => prev.filter((_, i) => i !== idx))}
              onAdd={(v) => setCcRecipients((prev) => [...prev, v])}
            />
          </div>
        </div>

        <div className={`reply-compact-row${showBcc ? '' : ' hidden'}`}>
          <span className="reply-compact-row-label">Bcc</span>
          <div className="reply-compact-row-body">
            <RecipientRow
              label="Bcc"
              recipients={bccRecipients}
              placeholder="Add Bcc recipient..."
              onRemove={(idx) => setBccRecipients((prev) => prev.filter((_, i) => i !== idx))}
              onAdd={(v) => setBccRecipients((prev) => [...prev, v])}
            />
          </div>
        </div>

        <div className="reply-compact-row">
          <span className="reply-compact-row-label">Subj</span>
          <input type="text" className="reply-panel-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
        </div>
      </div>

      {/* Mini formatting toolbar */}
      <div className="reply-mini-toolbar">
        <div className="reply-mini-toolbar-item">
          <button type="button" className="reply-mini-btn" title="Font formatting" onClick={(e) => { e.stopPropagation(); setShowEmojiMenu(false); setShowFormatMenu((v) => !v); }}>Aa</button>
          <div className={`reply-format-menu${showFormatMenu ? '' : ' hidden'}`}>
            <button type="button" onClick={() => execFormat('bold')}><b>B</b> Bold</button>
            <button type="button" onClick={() => execFormat('italic')}><i>I</i> Italic</button>
            <button type="button" onClick={() => execFormat('underline')}><u>U</u> Underline</button>
            <div className="reply-format-menu-sep" />
            <button type="button" onClick={() => execFormat('fontSize', '2')}>Small text</button>
            <button type="button" onClick={() => execFormat('fontSize', '3')}>Normal text</button>
            <button type="button" onClick={() => execFormat('fontSize', '5')}>Large text</button>
          </div>
        </div>
        <button type="button" className="reply-mini-btn" title="Attach files" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
          <AttachIcon size={16} />
        </button>
        <button type="button" className="reply-mini-btn" title="Insert link" onClick={(e) => { e.stopPropagation(); insertLink(); }}>
          <LinkIcon size={16} />
        </button>
        <div className="reply-mini-toolbar-item">
          <button type="button" className="reply-mini-btn" title="Insert emoji" onClick={(e) => { e.stopPropagation(); setShowFormatMenu(false); setShowEmojiMenu((v) => !v); }}>
            <EmojiIcon size={16} />
          </button>
          <div className={`reply-emoji-menu${showEmojiMenu ? '' : ' hidden'}`} onClick={(e) => e.stopPropagation()}>
            {REPLY_EMOJI_SET.map((em) => <button type="button" key={em} onClick={() => insertEmoji(em)}>{em}</button>)}
          </div>
        </div>
      </div>

      {/* Editor — resizable via native CSS resize on .reply-panel-editor */}
      <div className="reply-panel-editor-wrap">
        <div
          id="replyBody"
          ref={editorRef}
          className="reply-panel-editor"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Write your message here..."
        />
      </div>

      {attachments.length > 0 && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📎 Attachments ({attachments.length})</div>
          {attachments.map((att, i) => {
            const isImage = IMAGE_EXTENSIONS.includes(getFileExtension(att.name).toLowerCase());
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--surface)', borderRadius: 6, marginBottom: 4, border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 12 }}>
                  <strong>{att.name}</strong>{' '}
                  <span style={{ color: 'var(--text-muted)' }}>({(att.size / (1024 * 1024)).toFixed(2)} MB)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isImage && (
                    <button onClick={() => insertAttachmentIntoBody(i)} title="Insert image inline" style={{ border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}>Insert</button>
                  )}
                  <button onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))} style={{ border: 'none', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer: Send / Discard / Attach / Signature picker */}
      <div className="reply-panel-footer">
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
        <button className="reply-send-btn" onClick={handleSend} disabled={sending}>
          {sending ? 'Sending…' : (
            <><SendIcon size={15} style={{ fill: '#fff' }} />Send</>
          )}
        </button>
        <button className="reply-discard-btn" onClick={onClose}>Discard</button>
        <button className="reply-discard-btn" onClick={() => fileInputRef.current?.click()}>Attach</button>
        <div className="reply-sig-control">
          <label htmlFor="replySignatureSelect">Signature</label>
          <select id="replySignatureSelect" className="reply-sig-select" value={selectedSigName} onChange={(e) => setSelectedSigName(e.target.value)}>
            <option value="">None</option>
            {signatures.map((s) => <option key={s.id} value={s.name}>{s.name}{s.isDefault ? ' (default)' : ''}</option>)}
          </select>
          <button type="button" className="reply-sig-new-btn" onClick={() => setShowSigManager(true)}>+ New</button>
        </div>
      </div>

      {/* Original message — read-only, full HTML formatting, patched for cid: images by the parent */}
      <div className="reply-original-divider" />
      <div className="reply-original-label">Original message</div>
      <div className="message-history" id="messageHistory">
        <div className="message-history-item">
          <div className="message-history-header">
            <div className="message-history-avatar" style={{ background: getAvatarColor(from?.address || historySender) }}>{historyInitials}</div>
            <div className="message-history-meta">
              <div className="message-history-sender">{historySender}</div>
              <div className="message-history-date">{historyDate}</div>
            </div>
          </div>
          {message.body?.contentType === 'html' ? (
            <div id="replyMessageHistoryBody" className="message-history-body" dangerouslySetInnerHTML={{ __html: renderedHistoryBody }} />
          ) : (
            <pre id="replyMessageHistoryBody" className="message-history-body" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13 }}>{renderedHistoryBody}</pre>
          )}
        </div>
      </div>

      {showSigManager && (
        <SignatureManager onClose={() => { setShowSigManager(false); refreshSignatures(); }} />
      )}
    </div>
  );
}
