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

const cidMapCache = new Map<string, CidMap>();
const cidMapPending = new Map<string, Promise<CidMap>>();

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

/** Pure string transform — replaces every cid: reference in `html` with its resolved data: URL. Safe to call repeatedly / on every render. */
export function applyCidPatch(html: string, map: CidMap): string {
  if (!html || Object.keys(map).length === 0) return html;
  let patched = html;
  for (const [cidRef, dataUrl] of Object.entries(map)) {
    const escaped = cidRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    patched = patched.replace(new RegExp('cid:' + escaped, 'gi'), dataUrl);
  }
  return patched;
}

export function useCidImagePatch() {
  const getCidMap = useCallback(async (messageId: string, accountIdx: number, html: string): Promise<CidMap> => {
    if (cidMapCache.has(messageId)) return cidMapCache.get(messageId)!;
    if (cidMapPending.has(messageId)) return cidMapPending.get(messageId)!;

    const cidRefs = extractCidRefs(html);
    if (cidRefs.size === 0) {
      cidMapCache.set(messageId, {});
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
          cidMapCache.set(messageId, {});
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

        cidMapCache.set(messageId, patchMap);
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
