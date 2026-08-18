/**
 * Toast notification context.
 * Global toast system used across every feature — ported from toast() at line 13368.
 */

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

type ToastType = 'info' | 'success' | 'error';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  msg: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (msg: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

let _counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const toast = useCallback((msg: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = ++_counter;
    setToasts((prev) => [...prev, { id, msg, type, action }]);
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
      timers.current.delete(id);
    }, 4000);
    timers.current.set(id, t);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => dismiss(t.id)} title="Dismiss">
            {t.type === 'success' && (
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
            )}
            {t.type === 'error' && (
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
            )}
            {t.type === 'info' && (
              <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-8h2zm0-10h-2V7h2z" /></svg>
            )}
            <span style={{ flex: 1 }}>{t.msg}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action-btn"
                onClick={(e) => { e.stopPropagation(); t.action!.onClick(); dismiss(t.id); }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
