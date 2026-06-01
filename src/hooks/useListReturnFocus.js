import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { consumeListFocus } from '../utils/listReturnFocus';

export function useListReturnFocus({ ready, getElementForItem }) {
  const location = useLocation();
  const [focusedItemId, setFocusedItemId] = useState(null);

  useEffect(() => {
    if (!ready) return undefined;

    const saved = consumeListFocus(location);
    if (!saved) return undefined;

    let clearTimer;
    let frameOne;
    let frameTwo;

    frameOne = window.requestAnimationFrame(() => {
      setFocusedItemId(saved.itemId);

      frameTwo = window.requestAnimationFrame(() => {
        const el = getElementForItem?.(saved.itemId);

        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (typeof saved.scrollY === 'number') {
          window.scrollTo({ top: saved.scrollY, left: 0, behavior: 'smooth' });
        }

        clearTimer = window.setTimeout(() => setFocusedItemId(null), 4000);
      });
    });

    return () => {
      if (frameOne) window.cancelAnimationFrame(frameOne);
      if (frameTwo) window.cancelAnimationFrame(frameTwo);
      if (clearTimer) window.clearTimeout(clearTimer);
    };
  }, [ready, location, getElementForItem]);

  return focusedItemId;
}
