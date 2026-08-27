/**
 * Compose window — floating modal with minimize, maximize, resize, full ribbon,
 * CcBcc, attachments.
 *
 * Ported from showCompose() / sendEmail() / minimizeCompose() at lines 10838–10960.
 *
 * CONSTRAINTS (from react-migration-prompt.md):
 * - Uses native contenteditable + React refs (no rich-text library).
 * - from_alias / reply_to / send_email keys are account-scoped via storage service.
 * - Send flow: POST /me/sendMail (no thread context).
 * - Attachment limit: 25 MB per file.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useAccountsStore } from '../../store/accounts';
import { getDefaultSignature } from '../../services/storage/signatures';
import { getFromAlias, getReplyTo, getSendEmail, getSendDisplayName } from '../../services/storage/identity';
import { graphApi } from '../../services/graph/client';
import { useToast } from '../../app/providers/ToastProvider';
import { SignatureManager } from '../signatures/SignatureManager';
import { getFileExtension } from '../../utils/format';
import { extractInlineImages } from '../../utils/inline-images';
import {
  DismissIcon, SubtractIcon, MaximizeIcon, ArrowMinimizeIcon, AttachIcon,
  LinkIcon, EmojiIcon, SendIcon, SignatureIcon,
} from '../../components/icons';
import type { Signature } from '../../types';

interface ComposeAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
  size: number;
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

interface ComposeMeta {
  to?: string;
  subject?: string;
  bodyHtml?: string;
}

interface ComposeWindowProps {
  initial?: ComposeMeta;
  onClose: () => void;
}

const EMOJI_SET = [
  '😀','😂','😊','😍','🤔','😅','😉','😢','😎','🙌',
  '👍','👎','🙏','👏','💪','❤️','🎉','🔥','✅','⭐',
  '📌','📎','📅','⏰','😴','🤝','👋','🚀','💡','☕',
];

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 440;
const MIN_HEIGHT = 380;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function ComposeWindow({ initial, onClose }: ComposeWindowProps) {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const { toast } = useToast();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;

  const [to, setTo] = useState(initial?.to ?? '');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [showFromAlias, setShowFromAlias] = useState(false);
  const [showReplyTo, setShowReplyTo] = useState(false);
  const [fromAlias, setFromAlias] = useState('');
  const [replyToAddr, setReplyToAddr] = useState('');
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSigManager, setShowSigManager] = useState(false);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });

  const bodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialise body with signature + optional initial HTML
  useEffect(() => {
    if (!bodyRef.current) return;
    const sig = getDefaultSignature();
    const sigHtml = sig?.content ?? '';
    const initialBody = initial?.bodyHtml ?? '';
    bodyRef.current.innerHTML = (initialBody || '<br>') + (sigHtml ? `<br><div id="composeSignatureArea">${sigHtml}</div>` : '');
    bodyRef.current.focus();
  }, []);

  // Load persisted alias/replyTo on open
  useEffect(() => {
    if (!account) return;
    setFromAlias(getFromAlias(account.email));
    setReplyToAddr(getReplyTo(account.email));
  }, [account]);

  function startResize(e: ReactPointerEvent<HTMLDivElement>, edge: 'corner' | 'left' | 'top') {
    if (maximized) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;

    function onMove(ev: PointerEvent) {
      const dx = startX - ev.clientX;
      const dy = startY - ev.clientY;
      setSize({
        width: edge === 'corner' || edge === 'left' ? clamp(startW + dx, MIN_WIDTH, window.innerWidth - 40) : startW,
        height: edge === 'corner' || edge === 'top' ? clamp(startH + dy, MIN_HEIGHT, window.innerHeight - 80) : startH,
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function exec(cmd: string, val?: string) {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  function handleInsertLink() {
    const url = prompt('Enter URL (include https://):');
    if (!url) return;
    exec('createLink', url);
  }

  function handleInsertSignature(sig: Signature) {
    let sigArea = bodyRef.current?.querySelector('#composeSignatureArea') as HTMLElement | null;
    if (!sigArea && bodyRef.current) {
      sigArea = document.createElement('div');
      sigArea.id = 'composeSignatureArea';
      bodyRef.current.appendChild(sigArea);
    }
    if (sigArea) sigArea.innerHTML = sig.content;
    setShowSigManager(false);
    toast('Signature inserted', 'success');
  }

  function handleInsertEmoji(emoji: string) {
    bodyRef.current?.focus();
    document.execCommand('insertText', false, emoji);
    setShowEmojiPicker(false);
  }

  function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) { toast(`File too large: ${file.name} (max 25 MB)`, 'error'); continue; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        // dataUrl = data:<type>;base64,<bytes>
        const commaIdx = dataUrl.indexOf(',');
        const contentBytes = dataUrl.slice(commaIdx + 1);
        setAttachments((prev) => [...prev, { name: file.name, contentType: file.type || 'application/octet-stream', contentBytes, size: file.size }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  // Embeds an image attachment inline at the cursor and removes it from the
  // attachment list so it isn't ALSO sent as a separate file attachment.
  function insertAttachmentIntoBody(idx: number) {
    const att = attachments[idx];
    if (!att) return;
    const editor = bodyRef.current;
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

  async function handleSend() {
    if (!account) { toast('Select an account first', 'error'); return; }
    if (!to && !bcc) { toast('Recipient is required (To or BCC)', 'error'); return; }

    const parseRecipients = (str: string) =>
      str.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((e) => ({ emailAddress: { address: e } }));

    // Signature/inline images live in the editor as `data:` URIs; Exchange strips
    // those, so convert them to real inline (cid:) attachments before sending.
    const { html: bodyHtml, attachments: inlineImages } = extractInlineImages(bodyRef.current?.innerHTML ?? '');

    const sendEmail = getSendEmail(account.email);
    const sendDisplayName = getSendDisplayName(account.email);
    const alias = getFromAlias(account.email);
    const replyTo = getReplyTo(account.email);

    const msgPayload: Record<string, unknown> = {
      subject: subject || '(No Subject)',
      body: { contentType: 'HTML', content: `<div style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px">${bodyHtml}</div>` },
      toRecipients: parseRecipients(to),
    };

    if (cc) msgPayload.ccRecipients = parseRecipients(cc);
    if (bcc) msgPayload.bccRecipients = parseRecipients(bcc);
    if (replyTo) msgPayload.replyTo = [{ emailAddress: { address: replyTo } }];
    const allAttachments = [
      ...attachments.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.name,
        contentType: a.contentType,
        contentBytes: a.contentBytes,
      })),
      ...inlineImages,
    ];
    if (allAttachments.length > 0) msgPayload.attachments = allAttachments;

    if (sendEmail) {
      msgPayload.from = { emailAddress: { address: sendEmail, name: sendDisplayName || alias || account.displayName || '' } };
    } else if (alias) {
      msgPayload.from = { emailAddress: { address: account.email, name: alias } };
    }

    setSending(true);
    try {
      await graphApi('/me/sendMail', account.accessToken, 'POST', { message: msgPayload, saveToSentItems: true }, 3, currentAccountIdx);
      toast('Message sent', 'success');
      onClose();
    } catch (e) {
      toast('Send failed: ' + (e as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  const fromDisplay = account
    ? (getFromAlias(account.email) ? `${getFromAlias(account.email)} <${account.email}>` : account.email)
    : '—';

  if (minimized) {
    return (
      <div className="compose-taskbar" id="composeTaskbar">
        <span className="compose-taskbar-title" onClick={() => setMinimized(false)}>{subject || 'New message'}</span>
        <button onClick={() => setMinimized(false)} title="Restore"><MaximizeIcon size={13} /></button>
        <button onClick={onClose} title="Close"><DismissIcon size={14} /></button>
      </div>
    );
  }

  return (
    <div
      className={`compose-modal${maximized ? ' maximized' : ''}`}
      id="composeModal"
      style={maximized ? undefined : { width: size.width, height: size.height }}
      onClick={() => setShowEmojiPicker(false)}
    >
      {!maximized && (
        <>
          <div className="compose-resize-handle compose-resize-top" onPointerDown={(e) => startResize(e, 'top')} />
          <div className="compose-resize-handle compose-resize-left" onPointerDown={(e) => startResize(e, 'left')} />
          <div className="compose-resize-handle compose-resize-corner" onPointerDown={(e) => startResize(e, 'corner')} />
        </>
      )}

      {/* Header */}
      <div className="compose-modal-header" onDoubleClick={() => setMaximized((v) => !v)}>
        <span>{subject || 'New message'}</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="compose-modal-btn" onClick={() => setMinimized(true)} title="Minimize">
            <SubtractIcon size={14} />
          </button>
          <button className="compose-modal-btn" onClick={() => setMaximized((v) => !v)} title={maximized ? 'Restore' : 'Maximize'}>
            {maximized ? <ArrowMinimizeIcon size={14} /> : <MaximizeIcon size={13} />}
          </button>
          <button className="compose-modal-btn" onClick={onClose} title="Close">
            <DismissIcon size={15} />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="compose-fields">
        {/* From (alias display) */}
        <div className="compose-field-row">
          <span className="compose-field-label">From</span>
          <span id="composeFrom" style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, cursor: 'pointer' }} onClick={() => setShowFromAlias((v) => !v)}>{fromDisplay}</span>
          {showReplyTo && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>Reply-To: {replyToAddr || 'not set'}</span>}
        </div>

        {/* From Alias editor */}
        {showFromAlias && (
          <div className="compose-field-row" id="fromAliasField">
            <span className="compose-field-label">Display name</span>
            <input className="compose-field-input" value={fromAlias} onChange={(e) => setFromAlias(e.target.value)} placeholder="Your name shown to recipients" />
            <button className="compose-inline-btn" onClick={() => { if (account) { localStorage.setItem(`from_alias_${account.email.replace(/[^a-zA-Z0-9]/g,'_')}`, fromAlias); toast('Display name saved', 'success'); setShowFromAlias(false); } }}>Save</button>
            <button className="compose-inline-btn" onClick={() => { if (account) { localStorage.removeItem(`from_alias_${account.email.replace(/[^a-zA-Z0-9]/g,'_')}`); setFromAlias(''); toast('Display name cleared', 'success'); setShowFromAlias(false); } }}>Clear</button>
          </div>
        )}

        {/* To */}
        <div className="compose-field-row">
          <span className="compose-field-label">To</span>
          <input id="composeTo" className="compose-field-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Recipient email(s)" />
          <button className="compose-toggle-btn" onClick={() => setShowCc((v) => !v)}>Cc</button>
          <button className="compose-toggle-btn" onClick={() => setShowBcc((v) => !v)}>Bcc</button>
        </div>

        {showCc && (
          <div className="compose-field-row" id="composeCcRow">
            <span className="compose-field-label">Cc</span>
            <input id="composeCc" className="compose-field-input" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Cc recipient(s)" />
          </div>
        )}

        {showBcc && (
          <div className="compose-field-row" id="composeBccRow">
            <span className="compose-field-label">Bcc</span>
            <input id="composeBcc" className="compose-field-input" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Bcc recipient(s)" />
          </div>
        )}

        {/* Reply-To editor */}
        <div className="compose-field-row" id="replyToField" style={{ display: showReplyTo ? 'flex' : 'none' }}>
          <span className="compose-field-label">Reply-To</span>
          <input id="composeReplyTo" className="compose-field-input" value={replyToAddr} onChange={(e) => setReplyToAddr(e.target.value)} placeholder="reply-to@example.com" />
          <button className="compose-inline-btn" onClick={() => {
            if (!replyToAddr.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) { toast('Invalid email address', 'error'); return; }
            if (account) { localStorage.setItem(`reply_to_${account.email.replace(/[^a-zA-Z0-9]/g,'_')}`, replyToAddr); toast('Reply-To saved', 'success'); setShowReplyTo(false); }
          }}>Save</button>
          <button className="compose-inline-btn" onClick={() => {
            if (account) { localStorage.removeItem(`reply_to_${account.email.replace(/[^a-zA-Z0-9]/g,'_')}`); setReplyToAddr(''); toast('Reply-To cleared', 'success'); setShowReplyTo(false); }
          }}>Clear</button>
        </div>

        {/* Subject */}
        <div className="compose-field-row">
          <span className="compose-field-label">Subject</span>
          <input id="composeSubject" className="compose-field-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
        </div>
      </div>

      {/* Ribbon toolbar */}
      <div className="compose-ribbon">
        <button className="compose-btn" onClick={() => exec('bold')} title="Bold"><strong>B</strong></button>
        <button className="compose-btn" onClick={() => exec('italic')} title="Italic"><em>I</em></button>
        <button className="compose-btn" onClick={() => exec('underline')} title="Underline"><u>U</u></button>
        <button className="compose-btn" onClick={() => exec('strikeThrough')} title="Strike"><s>S</s></button>
        <div className="compose-sep" />
        <select onChange={(e) => exec('fontName', e.target.value)} className="compose-select">
          {['Segoe UI', 'Arial', 'Calibri', 'Times New Roman', 'Courier New', 'Georgia', 'Verdana'].map((f) => <option key={f}>{f}</option>)}
        </select>
        <select onChange={(e) => exec('fontSize', e.target.value)} className="compose-select" style={{ width: 52 }}>
          {[1,2,3,4,5,6,7].map((s) => <option key={s} value={s}>{[8,10,12,14,18,24,36][s-1]}</option>)}
        </select>
        <div className="compose-sep" />
        <button className="compose-btn" onClick={() => exec('insertUnorderedList')} title="Bullet list">
          <svg viewBox="0 0 24 24"><path d="M4 10.5c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5 1.5-.67 1.5-1.5-.67-1.5-1.5-1.5zm0-6c-.83 0-1.5.67-1.5 1.5S3.17 7.5 4 7.5 5.5 6.83 5.5 6 4.83 4.5 4 4.5zm0 12c-.83 0-1.5.68-1.5 1.5s.68 1.5 1.5 1.5 1.5-.68 1.5-1.5-.67-1.5-1.5-1.5zM7 19h14v-2H7v2zm0-6h14v-2H7v2zm0-8v2h14V5H7z" /></svg>
        </button>
        <button className="compose-btn" onClick={() => exec('insertOrderedList')} title="Numbered list">
          <svg viewBox="0 0 24 24"><path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" /></svg>
        </button>
        <button className="compose-btn" onClick={handleInsertLink} title="Insert link">
          <LinkIcon size={16} />
        </button>
        <div className="compose-sep" />
        {/* Attachment */}
        <button className="compose-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
          <AttachIcon size={16} />
        </button>
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
        {/* Emoji */}
        <div style={{ position: 'relative' }}>
          <button className="compose-btn" onClick={(e) => { e.stopPropagation(); setShowEmojiPicker((v) => !v); }} title="Emoji">
            <EmojiIcon size={16} />
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
              {EMOJI_SET.map((em) => (
                <button key={em} onClick={() => handleInsertEmoji(em)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, padding: 3 }}>{em}</button>
              ))}
            </div>
          )}
        </div>
        <div className="compose-sep" />
        {/* Signature */}
        <button className="compose-btn" style={{ width: 'auto', padding: '0 10px', gap: 5, fontSize: 12 }} onClick={() => setShowSigManager(true)} title="Insert a signature into this email">
          <SignatureIcon size={15} />
          Signature
        </button>
        <div className="compose-sep" />
        {/* Reply-To toggle */}
        <button
          className="compose-btn"
          id="replytoToggle"
          style={{ width: 'auto', padding: '0 8px', fontSize: 11, background: replyToAddr ? 'var(--success)' : undefined, color: replyToAddr ? '#fff' : undefined }}
          onClick={() => setShowReplyTo((v) => !v)}
          title={replyToAddr ? `Reply-To: ${replyToAddr}` : 'Set Reply-To address'}
        >
          Reply-To
        </button>
      </div>

      {/* Compose body */}
      <div
        id="composeBody"
        ref={bodyRef}
        className="compose-body"
        contentEditable
        suppressContentEditableWarning
        style={{ flex: 1, minHeight: 200, maxHeight: '100%' }}
      />

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div id="composeAttachList" style={{ padding: '10px 20px', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AttachIcon size={14} />
            Attachments ({attachments.length})
          </div>
          {attachments.map((att, i) => {
            const isImage = IMAGE_EXTENSIONS.includes(getFileExtension(att.name).toLowerCase());
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: 8, marginBottom: 6, border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{att.name}</strong><br />
                  <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{(att.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {isImage && (
                    <button onClick={() => insertAttachmentIntoBody(i)} title="Insert image inline" style={{ border: 'none', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, padding: '4px 8px' }}>Insert</button>
                  )}
                  <button onClick={() => removeAttachment(i)} style={{ border: 'none', background: 'transparent', color: 'var(--error)', cursor: 'pointer', fontSize: 20 }}>×</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="compose-footer">
        <button className="toolbar-btn primary" id="composeSendBtn" onClick={handleSend} disabled={sending}>
          {sending ? (
            <><div className="sending-spinner" />Sending...</>
          ) : (
            <><SendIcon size={14} style={{ fill: '#fff' }} />Send</>
          )}
        </button>
        <button className="toolbar-btn" onClick={onClose} style={{ marginLeft: 4 }}>Discard</button>
      </div>

      {showSigManager && (
        <SignatureManager onClose={() => setShowSigManager(false)} onInsert={handleInsertSignature} />
      )}
    </div>
  );
}
