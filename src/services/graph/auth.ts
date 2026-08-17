/**
 * Authentication service — token refresh logic.
 *
 * Ported faithfully from lines 12180–12274.
 * Supports:
 *  - Direct MS token endpoint (no proxy)
 *  - Configurable proxy URL (refresh_proxy_url localStorage key)
 */

import { getRefreshProxyUrl } from '../storage/smtp';
import { saveAccounts } from '../storage/accounts';

export const MS_CLIENT_ID = 'd3590ed6-52b3-4102-aeff-aad2292ab01c';

export function isTokenExpired(token?: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!payload.exp) return false;
    return payload.exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

interface AccountRef {
  accessToken: string;
  refreshToken?: string | null;
  clientId?: string;
  tenantId?: string;
  email?: string;
  tokenRefreshedAt?: string;
}

export async function refreshToken(
  idx: number,
  accounts: AccountRef[]
): Promise<void> {
  const acc = accounts[idx];
  if (!acc?.refreshToken) return;

  const clientId = acc.clientId || MS_CLIENT_ID;
  const tenant = acc.tenantId || 'common';
  const proxyUrl = getRefreshProxyUrl();

  let data: { access_token?: string; refresh_token?: string; error_description?: string; error?: string };

  if (proxyUrl) {
    const resp = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: acc.refreshToken,
        client_id: clientId,
        tenant,
      }),
    });
    data = await resp.json() as typeof data;
    if (!resp.ok) throw new Error(data.error_description || data.error || 'Refresh failed');
  } else {
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: acc.refreshToken,
      scope: 'https://graph.microsoft.com/.default offline_access',
    });
    const resp = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );
    data = await resp.json() as typeof data;
    if (!resp.ok) throw new Error(data.error_description || 'Refresh failed');
  }

  if (data.access_token) {
    accounts[idx].accessToken = data.access_token;
  }
  if (data.refresh_token) {
    accounts[idx].refreshToken = data.refresh_token;
  }
  accounts[idx].tokenRefreshedAt = new Date().toISOString();

  // Persist updated tokens
  saveAccounts(accounts as Parameters<typeof saveAccounts>[0]);
  console.log('[auth] Refreshed token for', acc.email);
}

export async function refreshAllTokens(accounts: AccountRef[]): Promise<void> {
  for (let i = 0; i < accounts.length; i++) {
    if (accounts[i].refreshToken) {
      try {
        await refreshToken(i, accounts);
      } catch (e) {
        console.log('[auth] Failed to refresh token for', accounts[i].email, (e as Error).message);
      }
    }
  }
}
