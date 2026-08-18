/**
 * Shared "long-running action in progress" text (e.g. "Exporting… (page 4)"),
 * set by MailView's toolbar action handlers (Load All, Export, Backup, Save
 * DB, Load DB, Sweep) and displayed in more than one place — the sync-status
 * pill and the far right of the toolbar those actions live in. A Zustand
 * store rather than a ref/prop is what makes that possible: any number of
 * components can subscribe independently, each re-rendering only itself
 * when the text changes, with no need to route the value back up through a
 * shared parent (which would reintroduce the whole-tree re-render this app
 * deliberately avoids elsewhere for translation-compatibility reasons).
 */
import { create } from 'zustand';

interface ActionStatusState {
  text: string | null;
  setText: (text: string | null) => void;
}

export const useActionStatusStore = create<ActionStatusState>((set) => ({
  text: null,
  setText: (text) => set({ text }),
}));
