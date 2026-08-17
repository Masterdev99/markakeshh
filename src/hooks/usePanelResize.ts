/**
 * usePanelResize — Generic panel resize hook.
 *
 * Ported from makeResizer() at lines 16877–16977.
 * Used for both the reply editor resize and the folder/reading pane splitter.
 */

import { useCallback, useEffect, useRef } from 'react';

interface PanelResizeOptions {
  minWidth?: number;
  maxWidth?: number;
  onResize?: (width: number) => void;
}

export function usePanelResize(opts: PanelResizeOptions = {}) {
  const { minWidth = 120, maxWidth = 800, onResize } = opts;
  const resizerRef = useRef<HTMLDivElement>(null);
  const targetWidthRef = useRef<number>(0);

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = targetWidthRef.current;
      const resizer = resizerRef.current;
      if (resizer) resizer.classList.add('dragging');

      function onMove(ev: MouseEvent) {
        const delta = ev.clientX - startX;
        const newW = Math.max(minWidth, Math.min(maxWidth, startW + delta));
        targetWidthRef.current = newW;
        onResize?.(newW);
      }

      function onUp() {
        if (resizer) resizer.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [minWidth, maxWidth, onResize]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // nothing to clean; listeners are removed in onUp
    };
  }, []);

  return { resizerRef, startResize, setWidth: (w: number) => { targetWidthRef.current = w; } };
}
