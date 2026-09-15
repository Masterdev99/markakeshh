/**
 * Translate-revert probe.
 *
 * Paste this whole file into the Chrome DevTools console on the running app,
 * THEN use Chrome's "Translate to ..." on the page. It hooks the DOM APIs that
 * can destroy translated content and records a stack trace at the exact moment
 * a translated node is clobbered — which names the React component responsible.
 *
 *   __tw.report()   → ranked list of culprits with stack traces
 *   __tw.stop()     → uninstall the hooks
 */
(() => {
  const hits = [];
  const isTranslated = (n) => {
    if (!n || n.nodeType !== 1) return false;
    if (n.tagName === 'FONT' && n.style.verticalAlign === 'inherit') return true;
    return !!n.querySelector?.('font[style*="vertical-align: inherit"]');
  };
  const anyTranslated = (nodes) => [...(nodes || [])].some(isTranslated);
  const where = (el) => {
    if (!el || el.nodeType !== 1) return String(el && el.nodeName);
    const path = [];
    for (let e = el; e && e.nodeType === 1 && path.length < 5; e = e.parentElement) {
      path.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
        (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
    }
    return path.join(' > ');
  };
  const record = (kind, target, detail) => {
    hits.push({ kind, at: where(target), detail, stack: new Error().stack.split('\n').slice(3, 12).join('\n'), t: Date.now() });
  };

  // 1. innerHTML assignment — wipes an entire translated subtree at once.
  const ih = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    ...ih,
    set(v) {
      if (isTranslated(this)) record('innerHTML=', this, String(v).slice(0, 120));
      return ih.set.call(this, v);
    },
  });

  // 2. textContent assignment on a translated element.
  const tc = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  Object.defineProperty(Node.prototype, 'textContent', {
    ...tc,
    set(v) {
      if (isTranslated(this)) record('textContent=', this, String(v).slice(0, 120));
      return tc.set.call(this, v);
    },
  });

  // 3. Structural removal/replacement of translated children.
  const rc = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (isTranslated(child)) record('removeChild', this, where(child));
    return rc.call(this, child);
  };
  const rp = Node.prototype.replaceChild;
  Node.prototype.replaceChild = function (nu, old) {
    if (isTranslated(old)) record('replaceChild', this, where(old));
    return rp.call(this, nu, old);
  };
  const rw = Element.prototype.replaceChildren;
  if (rw) Element.prototype.replaceChildren = function (...a) {
    if (anyTranslated(this.childNodes)) record('replaceChildren', this, '');
    return rw.apply(this, a);
  };

  window.__tw = {
    hits,
    report() {
      const byKind = {};
      for (const h of hits) {
        const k = h.kind + ' @ ' + h.at;
        (byKind[k] ||= { count: 0, sample: h }).count++;
      }
      const ranked = Object.entries(byKind).sort((a, b) => b[1].count - a[1].count);
      console.log('%c=== translate-revert probe: ' + hits.length + ' clobbering events ===', 'font-weight:bold');
      for (const [k, v] of ranked) {
        console.groupCollapsed(v.count + '×  ' + k);
        console.log(v.sample.detail);
        console.log(v.sample.stack);
        console.groupEnd();
      }
      return ranked.map(([k, v]) => ({ what: k, count: v.count }));
    },
    stop() {
      Object.defineProperty(Element.prototype, 'innerHTML', ih);
      Object.defineProperty(Node.prototype, 'textContent', tc);
      Node.prototype.removeChild = rc;
      Node.prototype.replaceChild = rp;
      if (rw) Element.prototype.replaceChildren = rw;
      console.log('probe removed');
    },
  };
  console.log('%ctranslate-revert probe armed. Now translate the page, use the app until it reverts, then run __tw.report()', 'color:#0a0');
})();
