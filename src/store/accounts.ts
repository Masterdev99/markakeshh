/**
 * Global accounts store.
 *
 * Manages the accounts array and currentAccountIdx — global state that
 * drives folder + message loads, token refresh, and feed sync.
 */

import { create } from 'zustand';
import type { Account } from '../types';
import { loadAccounts, saveAccounts, migrateAccountsKey } from '../services/storage/accounts';
import { setGraphAccounts } from '../services/graph/client';
import { STORAGE_KEYS } from '../utils/storage-keys';

interface AccountsState {
  accounts: Account[];
  currentAccountIdx: number;
  isAdmin: boolean;
  adminRoles: string[];

  // Actions
  initAccounts: () => void;
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  removeAccount: (idx: number) => void;
  updateAccount: (idx: number, patch: Partial<Account>) => void;
  selectAccount: (idx: number) => void;
  saveToStorage: () => void;
  setIsAdmin: (isAdmin: boolean, roles?: string[]) => void;
}

function saveCurrentAccountId(accounts: Account[], idx: number): void {
  const id = idx >= 0 ? accounts[idx]?.id : null;
  if (id) localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT_ID, id);
  else localStorage.removeItem(STORAGE_KEYS.CURRENT_ACCOUNT_ID);
}

function resolveIdxFromStoredId(accounts: Account[]): number {
  const storedId = localStorage.getItem(STORAGE_KEYS.CURRENT_ACCOUNT_ID);
  if (storedId) {
    const idx = accounts.findIndex((a) => a.id === storedId);
    if (idx >= 0) return idx;
  }
  return accounts.length > 0 ? 0 : -1;
}

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  currentAccountIdx: -1,
  isAdmin: false,
  adminRoles: [],

  initAccounts: () => {
    migrateAccountsKey();
    const accounts = loadAccounts();
    const currentAccountIdx = resolveIdxFromStoredId(accounts);
    set({ accounts, currentAccountIdx });
    setGraphAccounts(accounts);

    // Cross-tab sync: when another tab adds/removes/refreshes an account,
    // pick up the change here too instead of showing stale/blank state.
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEYS.ACCOUNTS) {
        const latest = loadAccounts();
        const prevSelectedId = get().currentAccountIdx >= 0 ? get().accounts[get().currentAccountIdx]?.id : null;
        const newIdx = prevSelectedId ? latest.findIndex((a) => a.id === prevSelectedId) : -1;
        set({ accounts: latest, currentAccountIdx: newIdx >= 0 ? newIdx : resolveIdxFromStoredId(latest) });
        setGraphAccounts(latest);
      } else if (e.key === STORAGE_KEYS.CURRENT_ACCOUNT_ID) {
        const idx = resolveIdxFromStoredId(get().accounts);
        set({ currentAccountIdx: idx });
      }
    });
  },

  setAccounts: (accounts) => {
    set({ accounts });
    setGraphAccounts(accounts);
    saveAccounts(accounts);
  },

  addAccount: (account) => {
    const accounts = [...get().accounts, account];
    set({ accounts });
    setGraphAccounts(accounts);
    saveAccounts(accounts);
  },

  removeAccount: (idx) => {
    const accounts = get().accounts.filter((_, i) => i !== idx);
    const current = get().currentAccountIdx;
    const newIdx = current === idx ? -1 : current > idx ? current - 1 : current;
    set({ accounts, currentAccountIdx: newIdx });
    setGraphAccounts(accounts);
    saveAccounts(accounts);
    saveCurrentAccountId(accounts, newIdx);
  },

  updateAccount: (idx, patch) => {
    const accounts = get().accounts.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    set({ accounts });
    setGraphAccounts(accounts);
    saveAccounts(accounts);
  },

  selectAccount: (idx) => {
    set({ currentAccountIdx: idx });
    saveCurrentAccountId(get().accounts, idx);
  },

  saveToStorage: () => {
    saveAccounts(get().accounts);
  },

  setIsAdmin: (isAdmin, roles = []) => {
    set({ isAdmin, adminRoles: roles });
  },
}));

// Convenience selectors
export const currentAccount = () => {
  const { accounts, currentAccountIdx } = useAccountsStore.getState();
  return currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
};
