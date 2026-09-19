/**
 * The small password card shown when a locked feature is opened, plus the
 * header's "unlocked" indicator. Mounted once in App.tsx. See featureLock.ts.
 */

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { requestUnlock, useFeatureLockStore, useFeatureUnlocked } from './featureLock';
import { LockClosedIcon, LockOpenIcon } from '../../components/icons';
import './lock.css';

export function LockPrompt() {
  const pending = useFeatureLockStore((s) => s.pending);
  const unlockedUntil = useFeatureLockStore((s) => s.unlockedUntil);
  const { tryUnlock, cancel, lock } = useFeatureLockStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-lock automatically when the unlock window runs out.
  useEffect(() => {
    if (!unlockedUntil) return;
    const remaining = unlockedUntil - Date.now();
    if (remaining <= 0) { lock(); return; }
    const t = setTimeout(lock, remaining);
    return () => clearTimeout(t);
  }, [unlockedUntil, lock]);

  // Reset the card each time it opens.
  useEffect(() => {
    if (!pending) return;
    setPassword('');
    setError(false);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [pending, cancel]);

  if (!pending) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password || checking) return;
    setChecking(true);
    const ok = await tryUnlock(password);
    setChecking(false);
    if (!ok) {
      setError(true);
      setShakeKey((k) => k + 1);
      setPassword('');
    }
  }

  return (
    <div className="lock-backdrop" onMouseDown={cancel}>
      <form
        key={shakeKey}
        className={`lock-card${error ? ' lock-card-error' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="Password required"
      >
        <div className="lock-card-head">
          <LockClosedIcon size={16} />
          <span>Unlock {pending.label}</span>
        </div>
        <div className="lock-card-row">
          <input
            ref={inputRef}
            autoFocus
            type="password"
            className="lock-card-input"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(false); }}
            aria-invalid={error}
          />
          <button type="submit" className="lock-card-btn" disabled={!password || checking}>Unlock</button>
        </div>
        <div className="lock-card-hint">
          {error ? <span className="lock-card-hint-error">Incorrect password</span> : 'Stays unlocked for 15 minutes · Esc to cancel'}
        </div>
      </form>
    </div>
  );
}

/** Header button shown only while unlocked: remaining minutes, click to lock now. */
export function LockStatusButton() {
  const unlocked = useFeatureUnlocked();
  const unlockedUntil = useFeatureLockStore((s) => s.unlockedUntil);
  const lock = useFeatureLockStore((s) => s.lock);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!unlocked) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [unlocked]);

  if (!unlocked) return null;
  const minutesLeft = Math.max(1, Math.ceil((unlockedUntil - Date.now()) / 60_000));

  return (
    <button
      type="button"
      className="header-btn lock-status-btn"
      title={`Protected features unlocked for ${minutesLeft} more min. Click to lock now.`}
      aria-label="Lock protected features now"
      onClick={lock}
    >
      <LockOpenIcon size={17} />
      <span className="lock-status-mins">{minutesLeft}m</span>
    </button>
  );
}

/** Stand-in for a locked full-page view (e.g. Admin after the unlock window expires). */
export function LockedGate({ label }: { label: string }) {
  return (
    <div className="lock-gate">
      <LockClosedIcon size={28} />
      <span>{label} is locked</span>
      <button type="button" className="lock-gate-btn" onClick={() => void requestUnlock(label)}>Unlock</button>
    </div>
  );
}
