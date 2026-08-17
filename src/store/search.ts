/**
 * Global search state — scope (all/current/subfolders/specific folder) and
 * refinement filter chips, shared between AppHeader (scope/filter UI) and
 * MailView (search execution + results filtering).
 *
 * Ported from the search-scope/search-filter-chip additions in New-mailbox.html
 * (isSearchActive/searchScope/searchActiveFilters, lines ~8044-8051, 17369-17481).
 */

import { create } from 'zustand';

export type SearchScopeType = 'all' | 'current' | 'subfolders' | 'folder';

export interface SearchScope {
  type: SearchScopeType;
  folderId: string | null;
  folderName: string | null;
}

interface SearchState {
  isSearchActive: boolean;
  query: string;
  scope: SearchScope;
  activeFilters: Set<string>;
  showFilterBar: boolean;

  startSearch: (query: string) => void;
  exitSearch: () => void;
  setScope: (scope: SearchScope) => void;
  toggleFilter: (key: string) => void;
  toggleFilterBar: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  isSearchActive: false,
  query: '',
  scope: { type: 'all', folderId: null, folderName: null },
  activeFilters: new Set(),
  showFilterBar: false,

  startSearch: (query) => set({ isSearchActive: true, query, showFilterBar: true }),

  exitSearch: () => set({ isSearchActive: false, query: '', activeFilters: new Set(), showFilterBar: false }),

  setScope: (scope) => set({ scope }),

  toggleFilter: (key) => {
    const next = new Set(get().activeFilters);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    set({ activeFilters: next });
  },

  toggleFilterBar: () => set((s) => ({ showFilterBar: !s.showFilterBar })),
}));
