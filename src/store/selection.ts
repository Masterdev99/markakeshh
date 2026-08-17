/**
 * Global message selection store.
 * Tracks bulk selection for bulk actions (mark read, delete, move).
 */

import { create } from 'zustand';

interface SelectionState {
  selectedIds: Set<string>;

  // Actions
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedIds: new Set(),

  toggleSelection: (id) => {
    const selected = new Set(get().selectedIds);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    set({ selectedIds: selected });
  },

  selectAll: (ids) => {
    set({ selectedIds: new Set(ids) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  isSelected: (id) => get().selectedIds.has(id),
}));
