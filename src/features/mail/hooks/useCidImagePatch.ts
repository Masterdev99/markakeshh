/**
 * useCidImagePatch hook — resolves cid: inline images to data: URLs.
 *
 * CRITICAL: The resolved HTML must flow back through React state (not an
 * imperative DOM mutation) — anything else can be silently reverted the next
 * time this component's JSX re-renders and React reconciles
 * dangerouslySetInnerHTML against the original (still cid:-only) string.
 * That divergence between "what's actually in the DOM" and "what React
 * believes the DOM should contain" was the cause of inline images loading
 * and then later disappearing. Callers must render
 * `dangerouslySetInnerHTML={{ __html: patchedHtml ?? rawHtml }}` using the
 * state this hook (indirectly, via applyCidPatch) helps produce — never
 * mutate the container's innerHTML by hand.
 *
 * The attachment lookup + fetch logic is ported faithfully from
 * patchCidImages() at lines 9485–9641; only the "apply" step changed from an
 * imperative DOM patch to a pure string transform so it can live in state.
 *
 * The resolved cid→dataURL map is cached at module scope (keyed by
 * messageId) so the reading pane body and the reply panel's quoted "original
 * message" — two separate instances of this hook — share one fetch instead
 * of each re-downloading the same attachment bytes.
 */

import { useCallback } from 'react';
import { graphApi } from '../../../services/graph/client';

interface Attachment {
  id: string;
  name?: string;
  contentId?: string;
  contentType?: string;
  contentBytes?: string;
  isInline?: boolean;
}

type CidMap = Record<string, string>;

// A 1x1 transparent GIF used in place of any cid: reference that couldn't be
// resolved to an attachment. Left unpatched, a literal `cid:...` src causes
// the browser to attempt a fetch with an unsupported URL scheme (a harmless
// but noisy net::ERR_UNKNOWN_URL_SCHEME on every load) and shows a broken-image
// icon; blanking it up front also avoids a second visible layout shift when
// the "broken" icon would otherwise later flip to a real image.
const BLANK_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

// Capped so a long mail session doesn't hold every inline image (as base64
// data URLs) for every message ever opened in memory for the life of the tab.
// Insertion order doubles as recency order — re-inserting a key on access
// keeps it at the "most recent" end, so eviction (shift the oldest key) is a
// simple LRU.
const CID_CACHE_MAX_MESSAGES = 30;
const cidMapCache = new Map<string, CidMap>();
const cidMapPending = new Map<string, Promise<CidMap>>();

function cacheCidMap(messageId: string, map: CidMap): void {
  cidMapCache.delete(messageId);
  cidMapCache.set(messageId, map);
  if (cidMapCache.size > CID_CACHE_MAX_MESSAGES) {
    const oldestKey = cidMapCache.keys().next().value;
    if (oldestKey !== undefined) cidMapCache.delete(oldestKey);
  }
}

function normalizeContentId(cid: string): string {
  // Strip angle brackets:  <foo@bar> → foo@bar
  // Lowercase for comparison
  return cid.replace(/^<|>$/g, '').toLowerCase();
}

function extractCidRefs(html: string): Set<string> {
  const refs = new Set<string>();
  const CID_RE = /\bcid:([^\s"'<>)\]]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = CID_RE.exec(html)) !== null) refs.add(m[1]);
  return refs;
}

/**
 * Pure string transform — replaces every cid: reference in `html` with its
 * resolved data: URL. Any ref left unresolved (not in `map`) is blanked
 * rather than left as a literal cid: URL. Safe to call repeatedly / on every
 * render.
 */
export function applyCidPatch(html: string, map: CidMap): string {
  if (!html || !html.includes('cid:')) return html;
  let patched = html;
  for (const [cidRef, dataUrl] of Object.entries(map)) {
    const escaped = cidRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patched = patched.replace(new RegExp('cid:' + escaped, 'gi'), dataUrl);
  }
  patched = patched.replace(/\bcid:[^\s"'<>)\]]+/gi, BLANK_PIXEL);
  return patched;
}

/** Blanks every cid: reference without waiting on attachment resolution — used for the first paint so unresolved refs never hit the browser as a live cid: URL. */
export function blankCidRefs(html: string): string {
  if (!html || !html.includes('cid:')) return html;
  return html.replace(/\bcid:[^\s"'<>)\]]+/gi, BLANK_PIXEL);
}

export function useCidImagePatch() {
  const getCidMap = useCallback(async (messageId: string, accountIdx: number, html: string): Promise<CidMap> => {
    if (cidMapCache.has(messageId)) {
      const cached = cidMapCache.get(messageId)!;
      cacheCidMap(messageId, cached); // bump recency
      return cached;
    }
    if (cidMapPending.has(messageId)) return cidMapPending.get(messageId)!;

    const cidRefs = extractCidRefs(html);
    if (cidRefs.size === 0) {
      cacheCidMap(messageId, {});
      return {};
    }

    const promise = (async (): Promise<CidMap> => {
      try {
        // Step 1 — list ALL attachments (no $select to avoid 400 on contentId)
        const listResp = (await graphApi(`/me/messages/${messageId}/attachments`, accountIdx)) as { value: Attachment[] };
        const allAtts: Attachment[] = listResp.value ?? [];

        // Step 2 — build lookup maps
        const cidIndex: Record<string, Attachment> = {};
        const nameIndex: Record<string, Attachment> = {};
        for (const att of allAtts) {
          if (att.contentId) {
            const key = normalizeContentId(att.contentId);
            if (key) cidIndex[key] = att;
          }
          if (att.name) nameIndex[att.name.toLowerCase()] = att;
        }

        // Step 3 — match each cid ref to an attachment (with fallback strategies)
        const attById: Record<string, { att: Attachment; cidRefs: string[] }> = {};
        for (const cidRef of cidRefs) {
          const normRef = normalizeContentId(cidRef);
          let att: Attachment | undefined = cidIndex[normRef];
          if (!att) att = nameIndex[normRef];
          if (!att) {
            const stem = normRef.replace(/@.*$/, '').toLowerCase();
            att = nameIndex[stem] ?? Object.values(nameIndex).find((a) => a.name?.toLowerCase().startsWith(stem));
          }
          if (!att) continue;
          if (!attById[att.id]) attById[att.id] = { att, cidRefs: [] };
          attById[att.id].cidRefs.push(cidRef);
        }

        if (Object.keys(attById).length === 0) {
          cacheCidMap(messageId, {});
          return {};
        }

        // Step 4 — fetch attachment bytes in parallel
        const fetchResults = await Promise.allSettled(
          Object.values(attById).map(({ att, cidRefs: refs }) =>
            (graphApi(`/me/messages/${messageId}/attachments/${att.id}`, accountIdx) as Promise<Attachment>)
              .then((full) => {
                if (!full?.contentBytes) return null;
                const mime = (full.contentType ?? att.contentType ?? 'image/png').split(';')[0].trim();
                return { cidRefs: refs, dataUrl: `data:${mime};base64,${full.contentBytes}` };
              })
              .catch(() => null)
          )
        );

        const patchMap: CidMap = {};
        fetchResults.forEach((r) => {
          if (r.status === 'fulfilled' && r.value) {
            r.value.cidRefs.forEach((ref) => { patchMap[ref] = r.value!.dataUrl; });
          }
        });

        cacheCidMap(messageId, patchMap);
        return patchMap;
      } catch (e) {
        console.warn('[cid-patch] Failed:', (e as Error).message);
        return {};
      } finally {
        cidMapPending.delete(messageId);
      }
    })();

    cidMapPending.set(messageId, promise);
    return promise;
  }, []);

  return getCidMap;
}
