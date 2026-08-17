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

export const useAccountsStore = create<AccountsState>((set, get) => ({
  accounts: [],
  currentAccountIdx: -1,
  isAdmin: false,
  adminRoles: [],

  initAccounts: () => {
    migrateAccountsKey();
    const accounts = loadAccounts();
    set({ accounts });
    setGraphAccounts(accounts);
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
  },

  updateAccount: (idx, patch) => {
    const accounts = get().accounts.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    set({ accounts });
    setGraphAccounts(accounts);
    saveAccounts(accounts);
  },

  selectAccount: (idx) => {
    set({ currentAccountIdx: idx });
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
