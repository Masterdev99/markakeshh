/**
 * Server-side Inbox Rules Graph API service.
 *
 * These are SERVER-BACKED rules, distinct from the client-side local console
 * rules (see services/storage/rules.ts). Do not conflate the two systems.
 *
 * Ported from lines 11254–11851.
 */

import { graphApi } from './client';
import type { InboxRule } from '../../types';

interface RulesListResponse {
  value: InboxRule[];
}

export async function fetchInboxRules(token: string, accountIdx: number): Promise<InboxRule[]> {
  const resp = await graphApi(
    '/me/mailFolders/inbox/messageRules',
    token,
    'GET',
    null,
    3,
    accountIdx
  ) as RulesListResponse;
  return resp.value ?? [];
}

export async function createInboxRule(
  rule: Omit<InboxRule, 'id'>,
  token: string,
  accountIdx: number
): Promise<InboxRule> {
  return graphApi(
    '/me/mailFolders/inbox/messageRules',
    token,
    'POST',
    rule,
    3,
    accountIdx
  ) as Promise<InboxRule>;
}

export async function updateInboxRule(
  ruleId: string,
  rule: Partial<InboxRule>,
  token: string,
  accountIdx: number
): Promise<InboxRule> {
  return graphApi(
    `/me/mailFolders/inbox/messageRules/${ruleId}`,
    token,
    'PATCH',
    rule,
    3,
    accountIdx
  ) as Promise<InboxRule>;
}

export async function deleteInboxRule(
  ruleId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/mailFolders/inbox/messageRules/${ruleId}`, token, 'DELETE', null, 3, accountIdx);
}
