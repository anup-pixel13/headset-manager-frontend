import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Smarter scroll behavior:
 *  - On PUSH / REPLACE to a NEW pathname    -> scroll to top
 *  - On POP (browser back/forward)          -> restore previous scroll position
 *  - On query-string only changes           -> DO NOT touch scroll (no jank when
 *                                              typing in search / changing filters)
 *
 * Per-pathname scroll positions are kept in sessionStorage so they survive reloads.
 */
const STORAGE_KEY = 'app:scrollPositions';

function readPositions() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePositions(map) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType(); // 'POP' | 'PUSH' | 'REPLACE'
  const prevPathRef = useRef(pathname);

  // Save scroll position on unload
  useEffect(() => {
    const handler = () => {
      const positions = readPositions();
      positions[prevPathRef.current] = window.scrollY;
      writePositions(positions);
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const prevPath = prevPathRef.current;

    // Save the scroll for the OLD path before navigating away
    if (prevPath !== pathname) {
      const positions = readPositions();
      positions[prevPath] = window.scrollY;
      writePositions(positions);
    }

    // Same pathname (only query string changed) -> do nothing
    if (prevPath === pathname) {
      return;
    }

    if (navType === 'POP') {
      // Browser back/forward -> restore previous position for this path
      const positions = readPositions();
      const y = positions[pathname] ?? 0;
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: 'instant' });
      });
    } else {
      // New navigation -> scroll to top
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }

    prevPathRef.current = pathname;
  }, [pathname, navType]);

  return null;
}
