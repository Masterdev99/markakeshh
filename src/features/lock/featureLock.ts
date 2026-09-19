/**
 * Feature lock — a lightweight password gate in front of the sensitive,
 * non-mailbox features (Settings, Quick steps, Load All, Export, Backup,
 * Save DB, Load DB, Admin). Normal mailbox use is never gated.
 *
 * One successful unlock opens every locked feature for UNLOCK_DURATION_MS,
 * then it re-locks on its own. The unlock expiry lives in sessionStorage, so
 * a page reload keeps it, but closing the tab locks again.
 *
 * The password is only ever compared as a SHA-256 hash. Set
 * VITE_FEATURE_LOCK_HASH (hex SHA-256 of the password) at build time to
 * override the default:  printf '%s' 'your-password' | shasum -a 256
 * This is a client-side gate: it keeps casual users out of these features,
 * but it's not a server-side security boundary.
 */
import { create } from 'zustand';

export const UNLOCK_DURATION_MS = 15 * 60 * 1000;

// SHA-256 of the default password "changeme".
const DEFAULT_PASSWORD_HASH = '057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86';
const PASSWORD_HASH = ((import.meta.env.VITE_FEATURE_LOCK_HASH as string | undefined) || DEFAULT_PASSWORD_HASH).trim().toLowerCase();

const STORAGE_KEY = 'feature_lock_unlocked_until';

function readStoredExpiry(): number {
  try {
    const v = Number(sessionStorage.getItem(STORAGE_KEY));
    return Number.isFinite(v) && v > Date.now() ? v : 0;
  } catch {
    return 0;
  }
}

function writeStoredExpiry(until: number): void {
  try {
    if (until) sessionStorage.setItem(STORAGE_KEY, String(until));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked — the unlock just won't survive a reload.
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface PendingRequest {
  label: string;
  resolve: (ok: boolean) => void;
}

interface FeatureLockState {
  unlockedUntil: number;
  pending: PendingRequest | null;
  /** Checks the password; on success unlocks and resolves any pending request. */
  tryUnlock: (password: string) => Promise<boolean>;
  /** Dismisses the prompt without unlocking. */
  cancel: () => void;
  lock: () => void;
}

export const useFeatureLockStore = create<FeatureLockState>((set, get) => ({
  unlockedUntil: readStoredExpiry(),
  pending: null,

  async tryUnlock(password) {
    if ((await sha256Hex(password)) !== PASSWORD_HASH) return false;
    const until = Date.now() + UNLOCK_DURATION_MS;
    writeStoredExpiry(until);
    const { pending } = get();
    set({ unlockedUntil: until, pending: null });
    pending?.resolve(true);
    return true;
  },

  cancel() {
    const { pending } = get();
    set({ pending: null });
    pending?.resolve(false);
  },

  lock() {
    writeStoredExpiry(0);
    set({ unlockedUntil: 0 });
  },
}));

export function isFeatureUnlocked(): boolean {
  return useFeatureLockStore.getState().unlockedUntil > Date.now();
}

/** React hook: true while the unlock window is open. Re-renders on lock/unlock. */
export function useFeatureUnlocked(): boolean {
  const until = useFeatureLockStore((s) => s.unlockedUntil);
  return until > Date.now();
}

/** Resolves true once unlocked (immediately if already unlocked), false if the user cancels. */
export function requestUnlock(label = 'this feature'): Promise<boolean> {
  if (isFeatureUnlocked()) return Promise.resolve(true);
  const { pending } = useFeatureLockStore.getState();
  pending?.resolve(false);
  return new Promise((resolve) => {
    useFeatureLockStore.setState({ pending: { label, resolve } });
  });
}

/**
 * Runs `fn` right away when unlocked. It runs synchronously in that case so
 * user-activation-gated calls such as `input.click()` for a file picker still
 * work. Otherwise it shows the prompt and runs `fn` after a successful unlock.
 */
export function withUnlock(label: string, fn: () => void): void {
  if (isFeatureUnlocked()) { fn(); return; }
  void requestUnlock(label).then((ok) => { if (ok) fn(); });
}
