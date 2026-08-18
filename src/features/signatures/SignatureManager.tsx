/**
 * Signature Manager modal — CRUD for email signatures.
 *
 * Ported from showSignatureManager() at lines 11630–11890, redesigned onto
 * the (previously unwired) card-grid layout in global.css's "SIGNATURE
 * MANAGER" section, plus click-to-resize for inserted images.
 * Storage: `email_signatures` (shared key, not account-scoped — original behavior).
 */

import { useEffect, useRef, useState } from 'react';
import { loadSignatures, saveSignatures } from '../../services/storage/signatures';
import type { Signature } from '../../types';
import { useToast } from '../../app/providers/ToastProvider';
import { DismissIcon, LinkIcon, ImageIcon, AddIcon, ArrowLeftIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';

interface SignatureManagerProps {
  onClose: () => void;
  /** When provided, shows an "Insert" button that hands back the selected signature and closes — used by Compose's "Sig" button. */
  onInsert?: (signature: Signature) => void;
}

const IMAGE_WIDTH_PRESETS = [
  { label: 'S', width: 120 },
  { label: 'M', width: 240 },
  { label: 'L', width: 400 },
  { label: 'Full', width: null },
];

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
}

export function SignatureManager({ onClose, onInsert }: SignatureManagerProps) {
  const { toast } = useToast();
  const [sigs, setSigs] = useState<Signature[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [name, setName] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isNew, setIsNew] = useState(false);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [handlePos, setHandlePos] = useState<{ x: number; y: number } | null>(null);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setSigs(loadSignatures());
  }, []);

  function selectSig(idx: number, list = sigs) {
    setSelectedIdx(idx);
    const sig = list[idx];
    if (sig) {
      setName(sig.name);
      setView('edit');
      setIsNew(false);
      setSelectedImg(null);
      // Editor isn't mounted until this render commits — set content next tick.
      requestAnimationFrame(() => { if (editorRef.current) editorRef.current.innerHTML = sig.content ?? ''; });
    }
  }

  function handleNew() {
    setSelectedIdx(-1);
    setName('');
    setIsNew(true);
    setView('edit');
    setSelectedImg(null);
    requestAnimationFrame(() => {
      if (editorRef.current) editorRef.current.innerHTML = '';
      editorRef.current?.focus();
    });
  }

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) { toast('Signature name is required', 'error'); return; }
    const content = editorRef.current?.innerHTML ?? '';

    const updated = [...sigs];
    if (selectedIdx >= 0 && !isNew) {
      updated[selectedIdx] = { ...updated[selectedIdx], name: trimmedName, content };
      setSigs(updated);
      saveSignatures(updated);
      toast('Signature saved', 'success');
    } else {
      const newSig: Signature = {
        id: Date.now().toString(),
        name: trimmedName,
        content,
        isDefault: updated.length === 0,
      };
      updated.push(newSig);
      setSigs(updated);
      saveSignatures(updated);
      toast('Signature created', 'success');
      setSelectedIdx(updated.length - 1);
    }
    setIsNew(false);
    setView('list');
  }

  function handleDelete(idx: number) {
    if (!sigs[idx]) return;
    if (!confirm(`Delete signature "${sigs[idx].name}"?`)) return;
    const updated = sigs.filter((_, i) => i !== idx);
    setSigs(updated);
    saveSignatures(updated);
    toast('Signature deleted', 'success');
    setSelectedIdx(-1);
    setView('list');
  }

  function handleSetDefault(idx: number) {
    const updated = sigs.map((s, i) => ({ ...s, isDefault: i === idx }));
    setSigs(updated);
    saveSignatures(updated);
    toast(`"${sigs[idx].name}" is now the default signature`, 'success');
  }

  function exec(cmd: string, val?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
  }

  function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Image too large (max 2 MB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      editorRef.current?.focus();
      document.execCommand('insertImage', false, dataUrl);
      editorRef.current?.querySelectorAll('img:not([data-sized])').forEach((img) => {
        const el = img as HTMLImageElement;
        el.style.maxWidth = '100%';
        el.style.width = '240px';
        el.style.height = 'auto';
        el.setAttribute('data-sized', '1');
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  /** Positions the resize handle at the image's bottom-right corner, relative to the scrollable editor wrapper (so it scrolls along with the content). */
  function updateHandlePosition(img: HTMLImageElement) {
    const wrap = editorWrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();
    setHandlePos({
      x: imgRect.right - wrapRect.left + wrap.scrollLeft,
      y: imgRect.bottom - wrapRect.top + wrap.scrollTop,
    });
  }

  function handleEditorClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      setSelectedImg(img);
      updateHandlePosition(img);
    } else {
      setSelectedImg(null);
      setHandlePos(null);
    }
  }

  function applyImageWidth(width: number | null) {
    if (!selectedImg) return;
    if (width === null) {
      selectedImg.style.width = '';
      selectedImg.style.maxWidth = '100%';
    } else {
      selectedImg.style.width = `${width}px`;
    }
    selectedImg.style.height = 'auto';
    updateHandlePosition(selectedImg);
    // Force a re-render so the toolbar reflects the new active preset.
    const img = selectedImg;
    setSelectedImg(null);
    requestAnimationFrame(() => setSelectedImg(img));
  }

  /** Free-form drag resize — alongside the quick S/M/L/Full presets, not instead of them. */
  function handleResizeHandleMouseDown(e: React.MouseEvent) {
    if (!selectedImg) return;
    e.preventDefault();
    e.stopPropagation();
    const img = selectedImg;
    dragStateRef.current = { startX: e.clientX, startWidth: img.offsetWidth };

    function onMove(ev: MouseEvent) {
      if (!dragStateRef.current) return;
      const delta = ev.clientX - dragStateRef.current.startX;
      const newWidth = Math.max(30, Math.round(dragStateRef.current.startWidth + delta));
      img.style.width = `${newWidth}px`;
      img.style.maxWidth = 'none';
      img.style.height = 'auto';
      updateHandlePosition(img);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      dragStateRef.current = null;
      // Force a re-render so the toolbar's preset highlighting reflects the new width.
      setSelectedImg(null);
      requestAnimationFrame(() => setSelectedImg(img));
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const listView = (
    <div className="sig-manager-body">
      <div className="sig-manager-list">
        <button type="button" className="sig-item" style={{ alignItems: 'center', justifyContent: 'center', minHeight: 90, color: 'var(--primary)', fontWeight: 600 }} onClick={handleNew}>
          <AddIcon size={22} />
          New signature
        </button>
        {sigs.map((sig, i) => (
          <button
            type="button"
            key={sig.id ?? i}
            className={`sig-item${selectedIdx === i ? ' active' : ''}`}
            onClick={() => selectSig(i)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{sig.name}</span>
              {sig.isDefault && (
                <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>default</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {stripHtml(sig.content) || 'Empty signature'}
            </div>
          </button>
        ))}
      </div>
      {sigs.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 8 }}>
          No signatures yet — create one to reuse it in Compose, Reply, and Forward.
        </div>
      )}
    </div>
  );

  const editView = (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Name field */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <button type="button" className="modal-btn secondary" style={{ padding: '6px 10px' }} onClick={() => setView('list')} title="Back to signature list">
          <ArrowLeftIcon size={15} />
        </button>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Name</label>
        <input
          className="form-input"
          style={{ flex: 1, padding: '6px 10px' }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Signature name"
          autoFocus
        />
      </div>

      {/* Formatting toolbar */}
      <div className="compose-toolbar" style={{ flexShrink: 0, background: 'var(--surface-alt)', padding: '6px 12px' }}>
        <button className="compose-btn" onClick={() => exec('bold')}><strong>B</strong></button>
        <button className="compose-btn" onClick={() => exec('italic')}><em>I</em></button>
        <button className="compose-btn" onClick={() => exec('underline')}><u>U</u></button>
        <div className="compose-sep" />
        <button className="compose-btn" onClick={() => { const url = prompt('Link URL:'); if (url) exec('createLink', url); }}>
          <LinkIcon size={15} />
        </button>
        <button className="compose-btn" onClick={() => imageInputRef.current?.click()} title="Insert image">
          <ImageIcon size={15} />
        </button>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleInsertImage} />

        {selectedImg && (
          <>
            <div className="compose-sep" />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Image size:</span>
            {IMAGE_WIDTH_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="compose-btn"
                style={{
                  width: 'auto', padding: '0 8px', fontSize: 11, fontFamily: 'inherit', fontWeight: 600,
                  background: (p.width === null ? !selectedImg.style.width : selectedImg.style.width === `${p.width}px`) ? 'var(--primary-light)' : 'transparent',
                  color: (p.width === null ? !selectedImg.style.width : selectedImg.style.width === `${p.width}px`) ? 'var(--primary)' : undefined,
                }}
                onClick={() => applyImageWidth(p.width)}
              >
                {p.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Signature editor — wrapped so the drag-resize handle can be positioned
          relative to it and scroll along with the content. */}
      <div
        ref={editorWrapRef}
        style={{ position: 'relative', flex: 1, overflow: 'auto', borderTop: '1px solid var(--border-light)' }}
        onScroll={() => selectedImg && updateHandlePosition(selectedImg)}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="compose-body"
          style={{ minHeight: 160, maxHeight: 'none', border: 'none', borderRadius: 0 }}
          onClick={handleEditorClick}
        />
        {selectedImg && handlePos && (
          <div
            className="sig-img-resize-handle"
            style={{ left: handlePos.x - 5, top: handlePos.y - 5 }}
            onMouseDown={handleResizeHandleMouseDown}
            title="Drag to resize"
          />
        )}
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
        <button className="modal-btn primary" onClick={handleSave}>Save</button>
        {onInsert && selectedIdx >= 0 && sigs[selectedIdx] && (
          <button className="modal-btn secondary" onClick={() => onInsert(sigs[selectedIdx])}>Insert</button>
        )}
        {selectedIdx >= 0 && !isNew && !sigs[selectedIdx]?.isDefault && (
          <button className="modal-btn secondary" onClick={() => handleSetDefault(selectedIdx)}>Set as default</button>
        )}
        {selectedIdx >= 0 && !isNew && (
          <button className="modal-btn secondary" style={{ color: 'var(--error)', marginLeft: 'auto' }} onClick={() => handleDelete(selectedIdx)}>Delete</button>
        )}
      </div>
    </div>
  );

  return (
    <Modal onClose={onClose} id="signatureManagerModal" style={{ width: 'min(900px, 92vw)', maxWidth: '95vw', height: '80vh', maxHeight: '80vh', display: 'flex', flexDirection: 'column', borderRadius: 8 }}>
      <div className="sig-manager-header" style={{ borderRadius: '8px 8px 0 0' }}>
        <h3>Signature Manager</h3>
        <button className="modal-close" onClick={onClose}>
          <DismissIcon size={18} />
        </button>
      </div>

      {view === 'list' ? listView : editView}
    </Modal>
  );
}
