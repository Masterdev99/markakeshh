/**
 * Light/dark theme toggle. Persists the user's explicit choice to
 * localStorage; falls back to the OS preference on first visit. The active
 * theme is applied as a `data-theme` attribute on <html>, which every color
 * in styles/tokens.css keys off of.
 */
import { create } from 'zustand';
import { STORAGE_KEYS } from '../utils/storage-keys';

export type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEYS.THEME);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
}

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE_KEYS.THEME, next);
    applyTheme(next);
    set({ theme: next });
  },
}));
