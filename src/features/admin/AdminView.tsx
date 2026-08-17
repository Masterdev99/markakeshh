/**
 * Admin -> Users — the legitimate admin feature (see admin.ts's header comment:
 * do NOT reintroduce the removed "Create User"/"View All Users" raw-fetch shortcut).
 *
 * Gated by isAdmin (App.tsx detects directory-role membership on account switch).
 * Covers: dashboard summary, searchable user list, and a per-user detail modal
 * with profile/mailbox/roles/MFA/devices tabs — the core of loadAdminDashboard()/
 * showUserDetail() at lines ~15000-16300 of mailbox.html. Billing/Copilot pages
 * (unconfirmed scope per FEATURE_MANIFEST.md) are intentionally left out.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccountsStore } from '../../store/accounts';
import { useToast } from '../../app/providers/ToastProvider';
import {
  fetchUsers, searchUsers, fetchUsersCount, fetchUser, enableDisableUser, resetPassword,
  fetchUserMailbox, fetchDirectoryRoles, assignUserRole, removeUserRole,
  fetchUserAuthMethods, removeAuthMethod, fetchUserDevices, removeDevice,
  fetchSubscribedSkus, fetchDomains, fetchOrgInfo, fetchAuditLogs, fetchSignInLogs,
} from '../../services/graph/admin';
import { DismissIcon } from '../../components/icons';
import type { DirectoryUser, DirectoryRole } from '../../types';
import './admin.css';

type AdminTab = 'dashboard' | 'users' | 'licenses' | 'domains' | 'audit' | 'signins';

export function AdminView() {
  const { accounts, currentAccountIdx, isAdmin, adminRoles } = useAccountsStore();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [search, setSearch] = useState('');
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['admin-users', account?.id, search],
    queryFn: () => account
      ? (search.trim() ? searchUsers(search.trim(), account.accessToken, currentAccountIdx) : fetchUsers(account.accessToken, currentAccountIdx))
      : Promise.resolve({ value: [] }),
    enabled: !!account && isAdmin,
  });

  const countQuery = useQuery({
    queryKey: ['admin-users-count', account?.id],
    queryFn: () => account ? fetchUsersCount(account.accessToken, currentAccountIdx) : 0,
    enabled: !!account && isAdmin && tab === 'dashboard',
  });

  const orgQuery = useQuery({
    queryKey: ['admin-org', account?.id],
    queryFn: () => account ? fetchOrgInfo(account.accessToken, currentAccountIdx) : null,
    enabled: !!account && isAdmin && tab === 'dashboard',
  });

  const licensesQuery = useQuery({
    queryKey: ['admin-licenses', account?.id],
    queryFn: () => account ? fetchSubscribedSkus(account.accessToken, currentAccountIdx) : null,
    enabled: !!account && isAdmin && (tab === 'licenses' || tab === 'dashboard'),
  });

  const domainsQuery = useQuery({
    queryKey: ['admin-domains', account?.id],
    queryFn: () => account ? fetchDomains(account.accessToken, currentAccountIdx) : null,
    enabled: !!account && isAdmin && tab === 'domains',
  });

  const auditQuery = useQuery({
    queryKey: ['admin-audit', account?.id],
    queryFn: () => account ? fetchAuditLogs(account.accessToken, currentAccountIdx) : null,
    enabled: !!account && isAdmin && tab === 'audit',
  });

  const signInsQuery = useQuery({
    queryKey: ['admin-signins', account?.id],
    queryFn: () => account ? fetchSignInLogs(account.accessToken, currentAccountIdx) : null,
    enabled: !!account && isAdmin && tab === 'signins',
  });

  if (!account) {
    return <div className="admin-empty">No account selected</div>;
  }

  if (!isAdmin) {
    return (
      <div className="admin-empty">
        <svg viewBox="0 0 24 24" width={40} height={40} style={{ fill: 'var(--text-muted)', marginBottom: 8 }}>
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
        </svg>
        <div>You don't have an administrator role on this account.</div>
      </div>
    );
  }

  const users = (usersQuery.data as { value?: DirectoryUser[] } | undefined)?.value ?? [];
  const skus = (licensesQuery.data as { value?: Array<{ skuId: string; skuPartNumber: string; consumedUnits: number; prepaidUnits?: { enabled: number } }> } | undefined)?.value ?? [];
  const domains = (domainsQuery.data as { value?: Array<{ id: string; isVerified: boolean; isDefault: boolean }> } | undefined)?.value ?? [];
  const auditEvents = (auditQuery.data as { value?: Array<{ id: string; activityDisplayName: string; activityDateTime: string; initiatedBy?: { user?: { userPrincipalName?: string } } }> } | undefined)?.value ?? [];
  const signIns = (signInsQuery.data as { value?: Array<{ id: string; userDisplayName: string; appDisplayName: string; createdDateTime: string; status?: { errorCode?: number } }> } | undefined)?.value ?? [];
  const org = (orgQuery.data as { value?: Array<{ displayName: string }> } | undefined)?.value?.[0];

  return (
    <div className="admin-view">
      <div className="admin-header">
        <h1>Admin Center</h1>
        <span className="admin-role-badge">{adminRoles[0] || 'Administrator'}</span>
      </div>

      <div className="admin-tabs">
        {(['dashboard', 'users', 'licenses', 'domains', 'audit', 'signins'] as AdminTab[]).map((t) => (
          <button key={t} className={`admin-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'signins' ? 'Sign-ins' : t === 'audit' ? 'Audit Logs' : t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {tab === 'dashboard' && (
          <div className="admin-cards">
            <div className="admin-card">
              <div className="admin-card-label">Organization</div>
              <div className="admin-card-value">{org?.displayName ?? '—'}</div>
            </div>
            <div className="admin-card">
              <div className="admin-card-label">Total Users</div>
              <div className="admin-card-value">{countQuery.data ?? '—'}</div>
            </div>
            <div className="admin-card">
              <div className="admin-card-label">Licenses</div>
              <div className="admin-card-value">{skus.length}</div>
            </div>
            <div className="admin-card">
              <div className="admin-card-label">Your Roles</div>
              <div className="admin-card-value" style={{ fontSize: 13 }}>{adminRoles.join(', ') || '—'}</div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <>
            <div className="admin-toolbar">
              <input
                className="form-input"
                style={{ maxWidth: 320 }}
                placeholder="Search users by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {usersQuery.isLoading ? (
              <div className="admin-empty">Loading users…</div>
            ) : users.length === 0 ? (
              <div className="admin-empty">No users found</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Job Title</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} onClick={() => setDetailUserId(u.id)} style={{ cursor: 'pointer' }}>
                      <td>{u.displayName}</td>
                      <td>{u.mail || u.userPrincipalName}</td>
                      <td>{u.jobTitle || '—'}</td>
                      <td>
                        <span className={`admin-status-badge${u.accountEnabled === false ? ' disabled' : ''}`}>
                          {u.accountEnabled === false ? 'Disabled' : 'Enabled'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}

        {tab === 'licenses' && (
          <table className="admin-table">
            <thead><tr><th>SKU</th><th>Assigned</th><th>Total</th></tr></thead>
            <tbody>
              {skus.map((s) => (
                <tr key={s.skuId}>
                  <td>{s.skuPartNumber}</td>
                  <td>{s.consumedUnits}</td>
                  <td>{s.prepaidUnits?.enabled ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'domains' && (
          <table className="admin-table">
            <thead><tr><th>Domain</th><th>Verified</th><th>Default</th></tr></thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id}>
                  <td>{d.id}</td>
                  <td>{d.isVerified ? 'Yes' : 'No'}</td>
                  <td>{d.isDefault ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'audit' && (
          <table className="admin-table">
            <thead><tr><th>Activity</th><th>Initiated By</th><th>Date</th></tr></thead>
            <tbody>
              {auditEvents.map((e) => (
                <tr key={e.id}>
                  <td>{e.activityDisplayName}</td>
                  <td>{e.initiatedBy?.user?.userPrincipalName || '—'}</td>
                  <td>{new Date(e.activityDateTime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'signins' && (
          <table className="admin-table">
            <thead><tr><th>User</th><th>App</th><th>Date</th><th>Status</th></tr></thead>
            <tbody>
              {signIns.map((s) => (
                <tr key={s.id}>
                  <td>{s.userDisplayName}</td>
                  <td>{s.appDisplayName}</td>
                  <td>{new Date(s.createdDateTime).toLocaleString()}</td>
                  <td>{s.status?.errorCode === 0 ? 'Success' : 'Failed'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detailUserId && (
        <UserDetailModal
          userId={detailUserId}
          accountIdx={currentAccountIdx}
          token={account.accessToken}
          onClose={() => setDetailUserId(null)}
        />
      )}
    </div>
  );
}

type DetailTab = 'profile' | 'mailbox' | 'roles' | 'mfa' | 'devices';

function UserDetailModal({ userId, accountIdx, token, onClose }: { userId: string; accountIdx: number; token: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<DetailTab>('profile');

  const userQuery = useQuery({
    queryKey: ['admin-user', userId],
    queryFn: () => fetchUser(userId, token, accountIdx),
  });

  const mailboxQuery = useQuery({
    queryKey: ['admin-user-mailbox', userId],
    queryFn: () => fetchUserMailbox(userId, token, accountIdx) as Promise<{ value?: Array<{ id: string; subject: string; from?: { emailAddress?: { name?: string } }; receivedDateTime: string; isRead: boolean }> }>,
    enabled: tab === 'mailbox',
  });

  const rolesQuery = useQuery({
    queryKey: ['admin-directory-roles'],
    queryFn: () => fetchDirectoryRoles(token, accountIdx),
    enabled: tab === 'roles',
  });

  const mfaQuery = useQuery({
    queryKey: ['admin-user-mfa', userId],
    queryFn: () => fetchUserAuthMethods(userId, token, accountIdx) as Promise<{ value?: Array<{ id: string; '@odata.type': string }> }>,
    enabled: tab === 'mfa',
  });

  const devicesQuery = useQuery({
    queryKey: ['admin-user-devices', userId],
    queryFn: () => fetchUserDevices(userId, token, accountIdx) as Promise<{ value?: Array<{ id: string; displayName: string; operatingSystem?: string; isCompliant?: boolean }> }>,
    enabled: tab === 'devices',
  });

  const user = userQuery.data;

  async function handleToggleEnabled() {
    if (!user) return;
    try {
      await enableDisableUser(userId, user.accountEnabled === false, token, accountIdx);
      toast(user.accountEnabled === false ? 'User enabled' : 'User disabled', 'success');
      qc.invalidateQueries({ queryKey: ['admin-user', userId] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleResetPassword() {
    const newPassword = prompt('Enter a new temporary password for this user:');
    if (!newPassword) return;
    try {
      await resetPassword(userId, { password: newPassword, forceChangePasswordNextSignIn: true }, token, accountIdx);
      toast('Password reset', 'success');
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleAssignRole(role: DirectoryRole) {
    try {
      await assignUserRole(role.id, userId, token, accountIdx);
      toast(`Assigned "${role.displayName}"`, 'success');
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleRemoveRole(role: DirectoryRole) {
    if (!confirm(`Remove role "${role.displayName}" from this user?`)) return;
    try {
      await removeUserRole(role.id, userId, token, accountIdx);
      toast(`Removed "${role.displayName}"`, 'success');
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleRemoveMfa(methodType: string, methodId: string) {
    if (!confirm('Remove this authentication method?')) return;
    try {
      await removeAuthMethod(userId, methodType, methodId, token, accountIdx);
      toast('Authentication method removed', 'success');
      qc.invalidateQueries({ queryKey: ['admin-user-mfa', userId] });
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  async function handleRemoveDevice(deviceId: string) {
    if (!confirm('Remove this device?')) return;
    try {
      await removeDevice(deviceId, token, accountIdx);
      toast('Device removed', 'success');
      qc.invalidateQueries({ queryKey: ['admin-user-devices', userId] });
    } catch (e) {
      toast('Failed: ' + (e as Error).message, 'error');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 640, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{user?.displayName || 'User detail'}</h2>
          <button className="modal-close" onClick={onClose}>
            <DismissIcon size={18} />
          </button>
        </div>

        <div className="admin-tabs" style={{ padding: '0 16px' }}>
          {(['profile', 'mailbox', 'roles', 'mfa', 'devices'] as DetailTab[]).map((t) => (
            <button key={t} className={`admin-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {t === 'mfa' ? 'MFA' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'profile' && user && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><strong>Email:</strong> {user.mail || user.userPrincipalName}</div>
              <div><strong>Job Title:</strong> {user.jobTitle || '—'}</div>
              <div><strong>Department:</strong> {user.department || '—'}</div>
              <div><strong>Usage Location:</strong> {user.usageLocation || '—'}</div>
              <div><strong>Status:</strong> {user.accountEnabled === false ? 'Disabled' : 'Enabled'}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="modal-btn secondary" onClick={handleToggleEnabled}>
                  {user.accountEnabled === false ? 'Enable account' : 'Disable account'}
                </button>
                <button className="modal-btn secondary" onClick={handleResetPassword}>Reset password</button>
              </div>
            </div>
          )}

          {tab === 'mailbox' && (
            mailboxQuery.isLoading ? <div className="admin-empty">Loading…</div> :
            (mailboxQuery.data?.value?.length ?? 0) === 0 ? <div className="admin-empty">No recent messages</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mailboxQuery.data!.value!.map((m) => (
                  <div key={m.id} style={{ padding: '8px 10px', border: '1px solid var(--border-light)', borderRadius: 6, fontSize: 13 }}>
                    <div style={{ fontWeight: m.isRead ? 400 : 700 }}>{m.subject || '(No subject)'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{m.from?.emailAddress?.name} · {new Date(m.receivedDateTime).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'roles' && (
            rolesQuery.isLoading ? <div className="admin-empty">Loading…</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(rolesQuery.data ?? []).map((r) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border-light)', borderRadius: 6, fontSize: 13 }}>
                    <span>{r.displayName}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="modal-btn secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => handleAssignRole(r)}>Assign</button>
                      <button className="modal-btn secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--error)' }} onClick={() => handleRemoveRole(r)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'mfa' && (
            mfaQuery.isLoading ? <div className="admin-empty">Loading…</div> :
            (mfaQuery.data?.value?.length ?? 0) === 0 ? <div className="admin-empty">No authentication methods</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mfaQuery.data!.value!.map((m) => {
                  const methodType = m['@odata.type']?.replace('#microsoft.graph.', '') || 'unknown';
                  return (
                    <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border-light)', borderRadius: 6, fontSize: 13 }}>
                      <span>{methodType}</span>
                      <button className="modal-btn secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--error)' }} onClick={() => handleRemoveMfa(methodType, m.id)}>Remove</button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'devices' && (
            devicesQuery.isLoading ? <div className="admin-empty">Loading…</div> :
            (devicesQuery.data?.value?.length ?? 0) === 0 ? <div className="admin-empty">No devices</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {devicesQuery.data!.value!.map((d) => (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', border: '1px solid var(--border-light)', borderRadius: 6, fontSize: 13 }}>
                    <div>
                      <div>{d.displayName}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.operatingSystem} · {d.isCompliant ? 'Compliant' : 'Non-compliant'}</div>
                    </div>
                    <button className="modal-btn secondary" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--error)' }} onClick={() => handleRemoveDevice(d.id)}>Remove</button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
