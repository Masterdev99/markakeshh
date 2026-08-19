/**
 * Live sync hook — polls for new messages and applies local rules.
 * Ported from checkNewMessages() at lines 12162–12280.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLatestMessages } from '../../../services/graph/messages';
import { loadLocalConsoleRules } from '../../../services/storage/rules';
import { telegramNotifyMessage } from '../../../services/storage/smtp';
import { graphApi } from '../../../services/graph/client';
import { getMailSyncIntervalSeconds } from '../../../services/storage/syncSettings';
import { escHtml } from '../../../utils/sanitize';
import type { Account, Message } from '../../../types';

interface LiveSyncOptions {
  account: Account | null;
  accountIdx: number;
  currentFolderId: string;
  allFolders: Array<{ id: string; displayName: string }>;
  onNewMessages: (msgs: Message[]) => void;
  /** Fired on every sync tick (not just when new mail arrives) so the UI can show a live "checking / synced / error" state instead of a static label. */
  onSyncTick?: (state: 'checking' | 'synced' | 'error') => void;
  /** Fired once, the first time the initial seed fetch succeeds for this account/folder — mirrors checkNewMessages()'s "messages.length === 0" first-load branch in New-mailbox.html, which re-fetches the folder tree at that point too (not just when new mail later arrives). Gives an account whose *initial* folder fetch happened to flake out a second chance right away instead of waiting for mail activity or a manual retry. */
  onFirstSync?: () => void;
  /** Fired once after a batch of local rule actions (move/delete/markAsRead/forward) finishes running against newly-arrived mail — mirrors New-mailbox.html's applyLocalRuleActions(), which unconditionally calls renderMessages()/updateMessageCount()/loadAllFolders() once it's done processing candidates (lines 13168-13170). Without this, a rule's server-side action (e.g. moving a message out of the inbox) completes correctly but the UI never re-fetches to show it, so the rule appears to do nothing. */
  onRuleActionsApplied?: () => void;
  enabled?: boolean;
}

export function useLiveSync({ account, accountIdx, currentFolderId, allFolders, onNewMessages, onSyncTick, onFirstSync, onRuleActionsApplied, enabled = true }: LiveSyncOptions) {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const keywordLoggedRef = useRef<Set<string>>(new Set());

  // Latest callback/derived-data refs, read inside the polling logic without
  // being callback/effect dependencies. MailView passes onNewMessages/
  // onSyncTick as new inline functions and allFolders as a freshly-flattened
  // array on every render — if those flowed into checkNewMessages/seedSeenIds'
  // dependency arrays (as they used to), each parent re-render would rebuild
  // the polling effects and re-run seedSeenIds. Since onSyncTick itself calls
  // setSyncState (a re-render-causing state update), that closed a feedback
  // loop: tick → re-render → rebuild → seed fetch → tick → re-render → ...,
  // firing requests as fast as the network would allow and tripping
  // net::ERR_INSUFFICIENT_RESOURCES.
  const onNewMessagesRef = useRef(onNewMessages);
  onNewMessagesRef.current = onNewMessages;
  const onSyncTickRef = useRef(onSyncTick);
  onSyncTickRef.current = onSyncTick;
  const onFirstSyncRef = useRef(onFirstSync);
  onFirstSyncRef.current = onFirstSync;
  const onRuleActionsAppliedRef = useRef(onRuleActionsApplied);
  onRuleActionsAppliedRef.current = onRuleActionsApplied;
  const allFoldersRef = useRef(allFolders);
  allFoldersRef.current = allFolders;

  const isInbox = useCallback(() => {
    const normalized = (currentFolderId || '').toLowerCase().replace(/\s+/g, '');
    if (normalized === 'inbox') return true;
    const f = allFoldersRef.current.find((x) => x.id === currentFolderId);
    return (f?.displayName || '').toLowerCase().replace(/\s+/g, '') === 'inbox';
  }, [currentFolderId]);

  const applyLocalRuleActions = useCallback(async (newMsgs: Message[]) => {
    if (!account || newMsgs.length === 0 || !isInbox()) return;

    const rules = loadLocalConsoleRules(account.email).filter(
      (r) => r.isEnabled && (r.actions?.moveToFolder || r.actions?.permanentDelete || r.actions?.markAsRead || r.actions?.forwardTo)
    );

    if (rules.length === 0) return;

    const candidates = newMsgs.filter((m) => m?.id && !keywordLoggedRef.current.has(m.id));
    if (candidates.length === 0) return;

    await Promise.allSettled(
      candidates.map(async (m) => {
        if (!m?.id) return null;

        const msg = await graphApi(
          `/me/messages/${m.id}?$select=id,subject,from,receivedDateTime,body,toRecipients,ccRecipients,hasAttachments`,
          account.accessToken, 'GET', null, 3, accountIdx
        ) as Message;

        const fromAddr = msg?.from?.emailAddress?.address || '';
        const subject = msg?.subject || '';
        const body = msg?.body?.content || '';
        const toAddrs = (msg?.toRecipients || []).map((x) => x?.emailAddress?.address).filter(Boolean);
        const ccAddrs = (msg?.ccRecipients || []).map((x) => x?.emailAddress?.address).filter(Boolean);

        const matchedRule = rules.find((r) => {
          const conds = Array.isArray(r.conditions?.all)
            ? r.conditions.all
            : r.conditions?.type && r.conditions?.value
              ? [{ type: r.conditions.type, value: r.conditions.value }]
              : [];
          if (conds.length === 0) return false;

          return conds.every((c) => {
            const type = c?.type;
            const values = (c?.value || '').split(',').map((s) => s.trim()).filter(Boolean);
            if (!type || values.length === 0) return false;
            const any = (fn: (v: string) => boolean) => values.some(fn);

            if (type === 'from') return any((v) => fromAddr.toLowerCase() === v.toLowerCase());
            if (type === 'fromDomain') { const d = fromAddr.split('@').pop() || ''; return any((v) => d.toLowerCase() === v.toLowerCase() || d.toLowerCase().includes(v.toLowerCase())); }
            if (type === 'to') return any((v) => toAddrs.map((a) => a.toLowerCase()).includes(v.toLowerCase()));
            if (type === 'senderAddressIncludes') return any((v) => fromAddr.toLowerCase().includes(v.toLowerCase()));
            if (type === 'recipientAddressIncludes') { const h = [...toAddrs, ...ccAddrs].join('\n').toLowerCase(); return any((v) => h.includes(v.toLowerCase())); }
            if (type === 'subjectIncludes') return any((v) => subject.toLowerCase().includes(v.toLowerCase()));
            if (type === 'subjectExact') return any((v) => subject.toLowerCase() === v.toLowerCase());
            if (type === 'bodyIncludes') return any((v) => body.toLowerCase().includes(v.toLowerCase()));
            if (type === 'subjectOrBodyIncludes') { const h = (subject + '\n' + body).toLowerCase(); return any((v) => h.includes(v.toLowerCase())); }
            if (type === 'hasAttachment') return m.hasAttachments === true;
            if (type === 'isUnread') return m.isRead === false;
            if (type === 'importanceIs') return any((v) => (m.importance || '').toLowerCase() === v.toLowerCase());
            if (type === 'sizeGreaterThan') { const kb = (m.size || 0) / 1024; return any((v) => kb > parseFloat(v)); }
            if (type === 'sizeLessThan') { const kb = (m.size || 0) / 1024; return any((v) => kb < parseFloat(v)); }
            if (type === 'receivedAfter') { const d = new Date(m.receivedDateTime); return any((v) => d > new Date(v)); }
            if (type === 'receivedBefore') { const d = new Date(m.receivedDateTime); return any((v) => d < new Date(v)); }
            if (type === 'categoryIs') { const cats = (m.categories || []).map((c) => c.toLowerCase()); return any((v) => cats.includes(v.toLowerCase())); }
            if (type === 'headerContains') { const h = (m.internetMessageHeaders || []).map((x) => `${x.name}: ${x.value}`).join('\n').toLowerCase(); return any((v) => h.includes(v.toLowerCase())); }
            return false;
          });
        });

        if (!matchedRule) return null;
        keywordLoggedRef.current.add(m.id);

        let currentMsgId = m.id;

        if (matchedRule.actions?.moveToFolder) {
          const result = await graphApi(`/me/messages/${currentMsgId}/move`, account.accessToken, 'POST', { destinationId: matchedRule.actions.moveToFolder }, 3, accountIdx) as Message;
          if (result?.id) currentMsgId = result.id;
        }

        if (matchedRule.actions?.markAsRead) {
          await graphApi(`/me/messages/${currentMsgId}`, account.accessToken, 'PATCH', { isRead: true }, 3, accountIdx);
        }

        if (matchedRule.actions?.permanentDelete) {
          await graphApi(`/me/messages/${currentMsgId}/permanentDelete`, account.accessToken, 'POST', {}, 3, accountIdx);
        }

        if (matchedRule.actions?.forwardTo) {
          try {
            const fromName = msg?.from?.emailAddress?.name || fromAddr || 'unknown';
            const receivedDate = msg?.receivedDateTime
              ? new Date(msg.receivedDateTime).toLocaleString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                })
              : '';
            const hasAtt = msg?.hasAttachments ? ' 📎' : '';
            const rawBody = body
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            const preview = rawBody.length > 300 ? rawBody.slice(0, 300) + '…' : rawBody || '(empty body)';
            const text = [
              `📧 <b>New email matched a rule</b>${hasAtt}`,
              '',
              `<b>From:</b> ${escHtml(fromName)} &lt;${escHtml(fromAddr)}&gt;`,
              `<b>Subject:</b> ${escHtml(subject || '(no subject)')}`,
              receivedDate ? `<b>Received:</b> ${escHtml(receivedDate)}` : null,
              '',
              escHtml(preview),
            ].filter((x) => x !== null).join('\n');
            await telegramNotifyMessage(text);
          } catch (_fwdErr) {
            // Silently ignore — matches original's caught-and-logged (non-fatal) behavior
          }
        }
      })
    );

    onRuleActionsAppliedRef.current?.();
  }, [account, accountIdx, isInbox]);

  const checkNewMessages = useCallback(async () => {
    if (!account) return;
    onSyncTickRef.current?.('checking');
    try {
      const latest = await fetchLatestMessages(currentFolderId, account.accessToken, accountIdx, 10);
      const newMsgs = latest.filter((m) => !seenIdsRef.current.has(m.id));
      newMsgs.forEach((m) => seenIdsRef.current.add(m.id));
      if (newMsgs.length > 0) {
        onNewMessagesRef.current(newMsgs);
        applyLocalRuleActions(newMsgs).catch(() => {});
      }
      onSyncTickRef.current?.('synced');
    } catch (_e) {
      // Silently ignore sync errors — they'll be visible via error toasts if severe
      onSyncTickRef.current?.('error');
    }
  }, [account, accountIdx, currentFolderId, applyLocalRuleActions]);

  // Seed initial seen IDs on mount / account change
  const seedSeenIds = useCallback(async () => {
    if (!account) return;
    onSyncTickRef.current?.('checking');
    try {
      const msgs = await fetchLatestMessages(currentFolderId, account.accessToken, accountIdx, 10);
      msgs.forEach((m) => seenIdsRef.current.add(m.id));
      onSyncTickRef.current?.('synced');
      onFirstSyncRef.current?.();
    } catch (_e) {
      onSyncTickRef.current?.('error');
    }
  }, [account, accountIdx, currentFolderId]);

  useEffect(() => {
    if (!enabled) return;
    seenIdsRef.current.clear();
    seedSeenIds();
  }, [seedSeenIds, enabled]);

  // User-configurable poll cadence (Settings → Mail → Refresh interval).
  // Re-read on the change event so an update takes effect immediately
  // instead of requiring a reload.
  const [intervalSeconds, setIntervalSeconds] = useState(getMailSyncIntervalSeconds);
  useEffect(() => {
    const handler = () => setIntervalSeconds(getMailSyncIntervalSeconds());
    window.addEventListener('outlook:mail-sync-interval-changed', handler);
    return () => window.removeEventListener('outlook:mail-sync-interval-changed', handler);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(checkNewMessages, intervalSeconds * 1_000);
    return () => clearInterval(id);
  }, [checkNewMessages, enabled, intervalSeconds]);

  return { checkNewMessages };
}
