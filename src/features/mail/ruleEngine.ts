/**
 * Local console rule matching + action execution.
 *
 * Extracted from useLiveSync's applyLocalRuleActions() so it can run for any
 * account — not just whichever one is currently shown in the mail view. The
 * matching/action logic itself is unchanged (still lines up with
 * checkNewMessages()/applyLocalRuleActions() in New-mailbox.html); only the
 * "which account, when" decision moved out to backgroundRuleSync.ts.
 */

import { graphApi } from '../../services/graph/client';
import { loadLocalConsoleRules } from '../../services/storage/rules';
import { telegramNotifyMessage } from '../../services/storage/smtp';
import { escHtml, htmlToPlainText } from '../../utils/sanitize';
import type { Account, Message } from '../../types';

/** True if this account has at least one enabled rule with "Notify via Telegram when matched" turned on. */
export function hasActiveTelegramRule(email?: string | null): boolean {
  return loadLocalConsoleRules(email).some((r) => r.isEnabled && r.actions?.forwardTo === 'telegram');
}

/**
 * Matches newly-arrived messages (expected to be from Inbox — rules are
 * inbox-only, same as the original) against an account's local console
 * rules and executes matched actions (move/delete/markAsRead/Telegram
 * notify). `processedIds` is caller-owned dedupe state (per account) so the
 * same message can't be double-actioned if two polls overlap.
 *
 * Returns true if any rule action was actually applied, so the caller knows
 * whether to refresh that account's message list / folder counts.
 */
export async function applyLocalRuleActions(
  account: Account,
  accountIdx: number,
  newMsgs: Message[],
  processedIds: Set<string>
): Promise<boolean> {
  if (newMsgs.length === 0) return false;

  const rules = loadLocalConsoleRules(account.email).filter(
    (r) => r.isEnabled && (r.actions?.moveToFolder || r.actions?.permanentDelete || r.actions?.markAsRead || r.actions?.forwardTo)
  );
  if (rules.length === 0) return false;

  const candidates = newMsgs.filter((m) => m?.id && !processedIds.has(m.id));
  if (candidates.length === 0) return false;

  let applied = false;

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
      processedIds.add(m.id);
      applied = true;

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
          const plainBody = htmlToPlainText(body, msg?.body?.contentType);
          const preview = plainBody.length > 300 ? plainBody.slice(0, 300) + '…' : plainBody || '(empty body)';
          const mailboxLabel = account.label || account.displayName || account.email;
          const mailboxLine = mailboxLabel && mailboxLabel !== account.email
            ? `${escHtml(mailboxLabel)} (${escHtml(account.email)})`
            : escHtml(account.email);
          const text = [
            // 🖥️ marks this notification as sent by the in-tab browser loop,
            // as opposed to ☁️ for the headless Cloudflare Worker (see
            // cloudflare-worker/src/telegram.ts) — lets you tell which one
            // actually fired when you're away from the device.
            `📧 <b>New email matched a rule</b> 🖥️${hasAtt}`,
            '',
            `<b>Mailbox:</b> ${mailboxLine}`,
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

  return applied;
}
