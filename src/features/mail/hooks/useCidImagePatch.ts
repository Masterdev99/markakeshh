/**
 * useCidImagePatch hook — resolves cid: inline images after render.
 *
 * CRITICAL: This hook MUST be applied on every container that renders
 * email HTML — reading pane body AND the reply/forward quoted text panel.
 * Missing it on either = broken inline images in that context.
 *
 * Ported faithfully from patchCidImages() at lines 9485–9641, including
 * the full 5-step algorithm with DOM scan + innerHTML regex scan +
 * parallel fetch + in-place src patch.
 */

import { useCallback, useRef } from 'react';
import { graphApi } from '../../../services/graph/client';

interface Attachment {
  id: string;
  name?: string;
  contentId?: string;
  contentType?: string;
  contentBytes?: string;
  isInline?: boolean;
}

function normalizeContentId(cid: string): string {
  // Strip angle brackets:  <foo@bar> → foo@bar
  // Lowercase for comparison
  return cid.replace(/^<|>$/g, '').toLowerCase();
}

export function useCidImagePatch() {
  const patchingRef = useRef<Set<string>>(new Set());

  const patchCidImages = useCallback(
    async (
      messageId: string,
      accountIdx: number,
      ...bodyEls: Array<HTMLElement | null>
    ) => {
      if (patchingRef.current.has(messageId)) return;
      patchingRef.current.add(messageId);

      try {
        // Step 1 — list ALL attachments (no $select to avoid 400 on contentId)
        const listResp = await graphApi(`/me/messages/${messageId}/attachments`, accountIdx) as { value: Attachment[] };
        const allAtts: Attachment[] = listResp.value ?? [];

        // Step 2 — build lookup maps
        const cidIndex: Record<string, Attachment> = {};
        const nameIndex: Record<string, Attachment> = {};

        for (const att of allAtts) {
          if (att.contentId) {
            const key = normalizeContentId(att.contentId);
            if (key) cidIndex[key] = att;
          }
          if (att.name) {
            nameIndex[att.name.toLowerCase()] = att;
          }
        }

        // Step 3 — collect every cid: reference in all body elements
        const validBodies = bodyEls.filter(Boolean) as HTMLElement[];
        if (validBodies.length === 0) return;

        const cidRefs = new Set<string>();

        for (const bodyEl of validBodies) {
          // 3a — DOM scan
          bodyEl.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src') || '';
            if (src.toLowerCase().startsWith('cid:')) {
              cidRefs.add(src.slice(4));
            }
          });

          // 3b — innerHTML regex scan (catches URL-encoded / normalised refs)
          const rawHtml = bodyEl.innerHTML;
          const CID_RE = /\bcid:([^\s"'<>)\]]+)/gi;
          let m: RegExpExecArray | null;
          while ((m = CID_RE.exec(rawHtml)) !== null) {
            cidRefs.add(m[1]);
          }
        }

        if (cidRefs.size === 0) return;

        // Step 4 — match each cid ref to an attachment (with 3 fallback strategies)
        const attById: Record<string, { att: Attachment; cidRefs: string[] }> = {};

        for (const cidRef of cidRefs) {
          const normRef = normalizeContentId(cidRef);
          let att: Attachment | undefined = cidIndex[normRef];

          // Fallback 1: treat the cid ref as a filename
          if (!att) att = nameIndex[normRef];

          // Fallback 2: strip @domain suffix and match filename stem
          if (!att) {
            const stem = normRef.replace(/@.*$/, '').toLowerCase();
            att = nameIndex[stem] ?? Object.values(nameIndex).find(
              (a) => a.name?.toLowerCase().startsWith(stem)
            );
          }

          if (!att) continue;

          if (!attById[att.id]) attById[att.id] = { att, cidRefs: [] };
          attById[att.id].cidRefs.push(cidRef);
        }

        if (Object.keys(attById).length === 0) return;

        // Step 5 — fetch attachment bytes in parallel
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

        // Build cid → dataUrl map
        const patchMap: Record<string, string> = {};
        fetchResults.forEach((r) => {
          if (r.status === 'fulfilled' && r.value) {
            r.value.cidRefs.forEach((ref) => { patchMap[ref] = r.value!.dataUrl; });
          }
        });

        if (Object.keys(patchMap).length === 0) return;

        // Step 6 — apply patches to DOM
        for (const bodyEl of validBodies) {
          // 6a — innerHTML replace for non-img cid refs (background-image, etc.)
          let patched = bodyEl.innerHTML;
          let changed = false;
          for (const [cidRef, dataUrl] of Object.entries(patchMap)) {
            const escaped = cidRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp('cid:' + escaped, 'gi');
            const next = patched.replace(re, dataUrl);
            if (next !== patched) { patched = next; changed = true; }
          }
          if (changed) bodyEl.innerHTML = patched;

          // 6b — img src surgical patch (after innerHTML so attrs are current)
          bodyEl.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src') || '';
            if (!src.toLowerCase().startsWith('cid:')) return;
            const ref = src.slice(4);
            const dataUrl =
              patchMap[ref] ??
              patchMap[normalizeContentId(ref)] ??
              patchMap[Object.keys(patchMap).find(
                (k) => normalizeContentId(k) === normalizeContentId(ref)
              ) ?? ''];
            if (dataUrl) img.setAttribute('src', dataUrl);
          });
        }
      } catch (e) {
        console.warn('[cid-patch] Failed:', (e as Error).message);
      } finally {
        patchingRef.current.delete(messageId);
      }
    },
    []
  );

  return patchCidImages;
}
