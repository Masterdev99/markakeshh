/**
 * Shared modal shell — a backdrop that closes on outside click, wrapping a
 * content box that never does.
 *
 * The backdrop-close and every outside-click listener elsewhere in the app
 * (AccountDropdown, SettingsMenu, AppLauncher) key off `mousedown`, not
 * `click`. Using `click` here would let a `mousedown` originating inside the
 * modal bubble all the way to `document` before this component ever gets a
 * chance to stop it — which is exactly what made every modal-with-an-input
 * self-close the instant you clicked into a field (see the AddAccountModal/
 * TelegramSettings cases, which render as a sibling of an ancestor dropdown's
 * ref'd container rather than a descendant, so `ref.contains(target)` was
 * always false for clicks on their own inputs). Stopping propagation at
 * `mousedown` on the content box prevents the event from ever reaching any
 * such ancestor listener, regardless of DOM nesting.
 */

import type { CSSProperties, MouseEvent, ReactNode } from 'react';

interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  id?: string;
}

export function Modal({ onClose, children, style, className, id }: ModalProps) {
  function stop(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={className ? `modal ${className}` : 'modal'}
        id={id}
        style={style}
        onMouseDown={stop}
        onClick={stop}
      >
        {children}
      </div>
    </div>
  );
}
