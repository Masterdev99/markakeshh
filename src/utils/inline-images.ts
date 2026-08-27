/**
 * Inline image extraction for outgoing mail.
 *
 * Signatures (and images dropped into the composer) are stored as `data:` URIs
 * because that is what contenteditable + FileReader produce. Outlook / Exchange
 * strips `data:` URIs out of received HTML, so the recipient sees a broken
 * image icon — the signature "doesn't send".
 *
 * The fix is the same thing a real mail client does: pull every data-URI image
 * out of the body, ship it as an inline `fileAttachment` with a Content-ID, and
 * rewrite the `src` to `cid:<contentId>`.
 *
 * MUST be applied by every send path (Compose, Reply, Reply All, Forward)
 * immediately before building the Graph payload.
 */

export interface InlineImageAttachment {
  '@odata.type': '#microsoft.graph.fileAttachment';
  name: string;
  contentType: string;
  contentBytes: string;
  contentId: string;
  isInline: true;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

/**
 * Rewrites `<img src="data:image/...;base64,...">` to `cid:` references and
 * returns the attachments those references need.
 *
 * Images already referencing `cid:` (the quoted original message in a reply)
 * are left untouched — those resolve against the draft's own attachments.
 */
export function extractInlineImages(html: string): { html: string; attachments: InlineImageAttachment[] } {
  if (!html || !html.includes('data:image/')) return { html, attachments: [] };

  const template = document.createElement('template');
  template.innerHTML = html;

  const attachments: InlineImageAttachment[] = [];
  const seed = Date.now().toString(36);

  template.content.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    const match = /^data:([^;,]+);base64,([\s\S]*)$/i.exec(src);
    if (!match) return;

    const contentType = match[1].toLowerCase();
    const contentBytes = match[2].replace(/\s/g, '');
    if (!contentType.startsWith('image/') || !contentBytes) return;

    const index = attachments.length + 1;
    const contentId = `inlineimg${index}${seed}`;
    const extension = EXTENSION_BY_MIME[contentType] || 'png';

    attachments.push({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: `image${index}.${extension}`,
      contentType,
      contentBytes,
      contentId,
      isInline: true,
    });

    img.setAttribute('src', `cid:${contentId}`);
    if (!img.getAttribute('alt')) img.setAttribute('alt', '');

    // Outlook desktop ignores CSS width on inline images in a lot of cases;
    // mirroring the rendered size onto the width/height attributes keeps the
    // signature the size the user set in the Signature Manager.
    const styleWidth = /^(\d+(?:\.\d+)?)px$/.exec(img.style.width || '');
    if (styleWidth && !img.getAttribute('width')) {
      img.setAttribute('width', String(Math.round(parseFloat(styleWidth[1]))));
    }
    if (!img.style.maxWidth) img.style.maxWidth = '100%';
  });

  return { html: template.innerHTML, attachments };
}
