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

// CSS properties stripped from inline `style` attributes. `position` lets an
// email set position:fixed/sticky with an inline style attribute, which
// escapes normal document flow and paints relative to the viewport instead
// of its actual container — a stray element from an email body can end up
// covering real app chrome (menus, buttons, the message-list/reading-pane
// resizer) regardless of DOM nesting. `z-index` only matters paired with a
// positioning scheme, so stripping both closes the escape rather than just
// making it harder to trigger. Ordinary formatting (colors, fonts, borders,
// table/box layout) never needs either property.
const FORBIDDEN_STYLE_PROPS = new Set(['position', 'z-index']);

function sanitizeStyleValue(value: string): string {
  return value
    .split(';')
    .filter((decl) => {
      const prop = decl.split(':')[0]?.trim().toLowerCase();
      return prop && !FORBIDDEN_STYLE_PROPS.has(prop);
    })
    .join(';');
}

function cleanNode(node: Node, baseHref: string | null): void {
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
          const raw = el.getAttribute(attr) || '';
          const val = raw.trim().toLowerCase().replace(/[\x00-\x20]+/g, '');
          // Allow cid: (inline images), http(s):, mailto:, tel:, relative paths
          if (/^(javascript|vbscript|data|file):/i.test(val)) {
            el.removeAttribute(attr);
          } else if (baseHref && raw && !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(raw)) {
            // The original email relied on a <base href> to resolve this
            // relative URL — that tag is stripped for safety, so resolve it
            // here instead, or the link/image would silently point at this
            // app's own origin (a broken link) rather than the sender's site.
            try {
              el.setAttribute(attr, new URL(raw, baseHref).href);
            } catch { /* leave as-is if unresolvable */ }
          }
        }
        if (lattr === 'style') {
          el.setAttribute(attr, sanitizeStyleValue(el.getAttribute(attr) || ''));
        }
      }

      // Force external links to open safely
      if (tag === 'a') {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }

      cleanNode(child, baseHref);
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

  // Capture <base href> before it's discarded (only doc.body is kept below)
  // so relative links/images that depended on it can still resolve correctly
  // instead of silently pointing at this app's own origin.
  const rawBase = doc.head.querySelector('base')?.getAttribute('href')?.trim() || null;
  const baseHref = rawBase && /^https?:\/\//i.test(rawBase) ? rawBase : null;

  cleanNode(doc.body, baseHref);
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

/**
 * Flattens an email body (HTML or plain text) into whitespace-collapsed
 * plain text, for use in previews (e.g. the Telegram rule-notification body).
 *
 * Uses a real DOM parse rather than a `<[^>]+>` regex strip: a regex both
 * leaves HTML entities (&nbsp;, &rsquo;, &amp;, &#39;, curly-quote entities,
 * etc.) behind as literal text — which is what produced garbled special
 * characters/unicode in notifications — and can eat legitimate plain-text
 * content that merely contains angle brackets (e.g. "3 < 5 > 2" matches
 * `<[^>]+>` and gets silently deleted). Parsing as a DOM decodes entities
 * for free and only strips things that are actually markup.
 */
export function htmlToPlainText(content: string, contentType?: string): string {
  if (!content) return '';
  if (contentType === 'text') return content.replace(/\s+/g, ' ').trim();
  try {
    const doc = new DOMParser().parseFromString(content, 'text/html');
    doc.querySelectorAll('script, style').forEach((el) => el.remove());
    return (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return content
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
