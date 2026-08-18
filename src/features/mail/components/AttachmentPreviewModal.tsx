/**
 * Attachment preview modal — opened by clicking an attachment chip instead
 * of immediately downloading, so the user can look before deciding to save.
 *
 * Images and PDFs render natively (via a blob: URL built from the
 * already-fetched contentBytes — see fetchAttachments in services/graph/messages.ts,
 * which returns full bytes in the list response). Word/Excel documents have
 * no browser-native renderer; the only way to preview those inline would be
 * to upload the attachment's bytes to a third-party viewer (e.g. Office
 * Online), which would leak the file's content off-device without explicit
 * consent — so those show a plain "no preview" state with a Download button
 * instead of silently doing that.
 */
import { useEffect, useState } from 'react';
import { Modal } from '../../../components/Modal';
import { DismissIcon, ArrowDownloadIcon } from '../../../components/icons';
import { FileTypeIcon, getFileIconKind } from '../../../components/fileTypeIcons';
import { base64ToBlob, formatFileSize, getFileExtension } from '../../../utils/format';
import type { Attachment } from '../../../types';

interface AttachmentPreviewModalProps {
  attachment: Attachment;
  onClose: () => void;
  onDownload: (att: Attachment) => void;
}

export function AttachmentPreviewModal({ attachment, onClose, onDownload }: AttachmentPreviewModalProps) {
  const ext = getFileExtension(attachment.name).toLowerCase();
  const isImage = attachment.contentType?.startsWith('image/') ?? false;
  const isPdf = attachment.contentType === 'application/pdf' || ext === 'pdf';
  const canPreview = (isImage || isPdf) && !!attachment.contentBytes;

  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!canPreview || !attachment.contentBytes) { setObjectUrl(null); return; }
    const mime = attachment.contentType || (isPdf ? 'application/pdf' : 'application/octet-stream');
    const blob = base64ToBlob(attachment.contentBytes, mime);
    const url = URL.createObjectURL(blob);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id]);

  return (
    <Modal onClose={onClose} style={{ width: 'min(920px, 92vw)', height: '85vh', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
      <div className="modal-header">
        <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={attachment.name}>{attachment.name}</h2>
        <button className="modal-close" onClick={onClose}>
          <DismissIcon size={18} />
        </button>
      </div>

      <div className="attachment-preview-body">
        {!canPreview || !objectUrl ? (
          <div className="attachment-preview-empty">
            <FileTypeIcon kind={getFileIconKind(ext)} size={56} />
            <div style={{ fontWeight: 600 }}>Preview not available for this file type</div>
            <div style={{ fontSize: 12 }}>Download it to open in its own app</div>
          </div>
        ) : isImage ? (
          <div className="attachment-preview-image-wrap">
            <img src={objectUrl} alt={attachment.name} />
          </div>
        ) : (
          <iframe src={objectUrl} title={attachment.name} className="attachment-preview-frame" />
        )}
      </div>

      <div className="modal-footer">
        <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{formatFileSize(attachment.size)}</span>
        <button className="modal-btn primary" onClick={() => onDownload(attachment)}>
          <ArrowDownloadIcon size={15} style={{ fill: '#fff' }} />
          Download
        </button>
      </div>
    </Modal>
  );
}
