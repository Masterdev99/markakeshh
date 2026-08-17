/**
 * Signature Manager modal — CRUD for email signatures.
 *
 * Ported from showSignatureManager() at lines 11630–11890.
 * Storage: `email_signatures` (shared key, not account-scoped — original behavior).
 */

import { useEffect, useRef, useState } from 'react';
import { loadSignatures, saveSignatures } from '../../services/storage/signatures';
import type { Signature } from '../../types';
import { useToast } from '../../app/providers/ToastProvider';
import { DismissIcon, LinkIcon, ImageIcon } from '../../components/icons';
import { Modal } from '../../components/Modal';

interface SignatureManagerProps {
  onClose: () => void;
  /** When provided, shows an "Insert" button that hands back the selected signature and closes — used by Compose's "Sig" button. */
  onInsert?: (signature: Signature) => void;
}

export function SignatureManager({ onClose, onInsert }: SignatureManagerProps) {
  const { toast } = useToast();
  const [sigs, setSigs] = useState<Signature[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [name, setName] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    const loaded = loadSignatures();
    setSigs(loaded);
    if (loaded.length > 0) selectSig(0, loaded);
  }, []);

  function selectSig(idx: number, list = sigs) {
    setSelectedIdx(idx);
    const sig = list[idx];
    if (sig) {
      setName(sig.name);
      if (editorRef.current) editorRef.current.innerHTML = sig.content ?? '';
    }
    setIsNew(false);
  }

  function handleNew() {
    setSelectedIdx(-1);
    setName('');
    if (editorRef.current) editorRef.current.innerHTML = '';
    setIsNew(true);
    editorRef.current?.focus();
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
      selectSig(updated.length - 1, updated);
    }
    setIsNew(false);
  }

  function handleDelete() {
    if (selectedIdx < 0 || !sigs[selectedIdx]) return;
    if (!confirm(`Delete signature "${sigs[selectedIdx].name}"?`)) return;
    const updated = sigs.filter((_, i) => i !== selectedIdx);
    setSigs(updated);
    saveSignatures(updated);
    toast('Signature deleted', 'success');
    setSelectedIdx(-1);
    setName('');
    if (editorRef.current) editorRef.current.innerHTML = '';
    if (updated.length > 0) selectSig(0, updated);
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
      // Make inserted image responsive
      editorRef.current?.querySelectorAll('img:not([style])').forEach((img) => {
        (img as HTMLImageElement).style.maxWidth = '100%';
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <Modal onClose={onClose} id="signatureManagerModal" style={{ width: 860, maxWidth: '95vw', height: '80vh', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Signature Manager</h2>
          <button className="modal-close" onClick={onClose}>
            <DismissIcon size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 0 }}>
          {/* Left panel — signature list */}
          <div style={{ width: 220, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-light)' }}>
              <button className="modal-btn primary" style={{ width: '100%' }} onClick={handleNew}>+ New Signature</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sigs.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No signatures yet</div>
              )}
              {sigs.map((sig, i) => (
                <div
                  key={sig.id ?? i}
                  className={`folder-item${selectedIdx === i ? ' active' : ''}`}
                  style={{ padding: '8px 12px', cursor: 'pointer', justifyContent: 'space-between' }}
                  onClick={() => selectSig(i)}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sig.name}</span>
                  {sig.isDefault && (
                    <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>default</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right panel — editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Name field */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <label style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Name</label>
              <input
                className="form-input"
                style={{ flex: 1, padding: '4px 8px' }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Signature name"
              />
            </div>

            {/* Formatting toolbar */}
            <div className="compose-toolbar" style={{ flexShrink: 0, background: 'var(--surface-alt)' }}>
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
            </div>

            {/* Signature editor */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="compose-body"
              style={{ flex: 1, minHeight: 120, border: 'none', borderTop: '1px solid var(--border-light)', borderRadius: 0 }}
            />

            {/* Footer actions */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
              <button className="modal-btn primary" onClick={handleSave}>Save</button>
              {onInsert && selectedIdx >= 0 && sigs[selectedIdx] && (
                <button className="modal-btn secondary" onClick={() => onInsert(sigs[selectedIdx])}>Insert</button>
              )}
              {selectedIdx >= 0 && !sigs[selectedIdx]?.isDefault && (
                <button className="modal-btn secondary" onClick={() => handleSetDefault(selectedIdx)}>Set as default</button>
              )}
              {selectedIdx >= 0 && (
                <button className="modal-btn secondary" style={{ color: 'var(--error)', marginLeft: 'auto' }} onClick={handleDelete}>Delete</button>
              )}
            </div>
          </div>
        </div>
    </Modal>
  );
}
