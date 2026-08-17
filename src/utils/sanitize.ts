/**
 * Sanitizes HTML email bodies before rendering.
 *
 * SECURITY-CRITICAL: This is the XSS boundary for rendering third-party HTML
 * email content. Port faithfully — do NOT simplify the allowlist logic.
 * Based on the original sanitizeHtml() at lines 13274–13344.
 */

const FORBIDDEN_TAGS = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'base', 'form', 'input', 'button', 'select', 'textarea',
  'link', 'meta', 'svg', 'math', 'xml', 'xmp', 'template', 'slot', 'portal',
]);

const SAFE_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'width', 'height', 'align', 'valign',
  'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan', 'scope',
  'class', 'id', 'style', 'dir', 'lang', 'face', 'size', 'color',
  'bgcolor', 'background', 'target', 'rel', 'type', 'name', 'charset',
  'start', 'reversed', 'value', 'media', 'cite', 'datetime', 'abbr',
  'axis', 'headers', 'nowrap', 'rules', 'frame', 'summary', 'span', 'data',
]);

// Attributes whose values must never contain javascript: or data: URIs
const URL_ATTRS = new Set(['href', 'src', 'action', 'background', 'lowsrc', 'dynsrc']);

function cleanNode(node: Node): void {
  const toRemove: Node[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (FORBIDDEN_TAGS.has(tag)) {
        toRemove.push(child);
        continue;
      }

      // Strip forbidden attributes
      const attrNames = Array.from(el.attributes).map((a) => a.name);
      for (const attr of attrNames) {
        const lattr = attr.toLowerCase();
        if (!SAFE_ATTRS.has(lattr) || lattr.startsWith('on')) {
          el.removeAttribute(attr);
          continue;
        }
        if (URL_ATTRS.has(lattr)) {
          const val = (el.getAttribute(attr) || '').trim().toLowerCase().replace(/[\x00-\x20]+/g, '');
          // Allow cid: (inline images), http(s):, mailto:, tel:, relative paths
          if (/^(javascript|vbscript|data|file):/i.test(val)) {
            el.removeAttribute(attr);
          }
        }
      }

      // Force external links to open safely
      if (tag === 'a') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }

      cleanNode(child);
    }
  }
  toRemove.forEach((n) => n.parentNode?.removeChild(n));
}

export function sanitizeHtml(html: string): string {
  // Allowlist-based sanitization using DOMParser so we work on a real DOM,
  // not regex-hacked strings. This catches nested/malformed markup that
  // regex cannot reliably handle.
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch (_e) {
    // DOMParser unavailable — fall back to aggressive regex strip
    return html
      .replace(/<(script|style|iframe|object|embed|form|base|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(script|style|iframe|object|embed|form|base|link|meta)[^>]*\/?>/gi, '')
      .replace(/\bon\w+\s*=\s*(['"])[^'"]*\1/gi, '')
      .replace(/\bon\w+\s*=[^\s>]*/gi, '');
  }

  cleanNode(doc.body);
  return doc.body.innerHTML;
}

/**
 * Escape a string for safe insertion as HTML text content.
 * Equivalent to original escHtml() at line 13269.
 */
export function escHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
