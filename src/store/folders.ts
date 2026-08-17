/**
 * Global folders store.
 * Tracks current folder and drives message list reloads.
 */

import { create } from 'zustand';
import type { MailFolder } from '../types';

interface FoldersState {
  folders: MailFolder[];
  currentFolderId: string;
  expandedFolderIds: Set<string>;

  // Actions
  setFolders: (folders: MailFolder[]) => void;
  setCurrentFolder: (folderId: string) => void;
  toggleFolderExpanded: (folderId: string) => void;
  expandFolder: (folderId: string) => void;
}

export const useFoldersStore = create<FoldersState>((set, get) => ({
  folders: [],
  currentFolderId: 'inbox',
  expandedFolderIds: new Set(),

  setFolders: (folders) => set({ folders }),

  setCurrentFolder: (folderId) => set({ currentFolderId: folderId }),

  toggleFolderExpanded: (folderId) => {
    const expanded = new Set(get().expandedFolderIds);
    if (expanded.has(folderId)) expanded.delete(folderId);
    else expanded.add(folderId);
    set({ expandedFolderIds: expanded });
  },

  expandFolder: (folderId) => {
    const expanded = new Set(get().expandedFolderIds);
    expanded.add(folderId);
    set({ expandedFolderIds: expanded });
  },
}));
