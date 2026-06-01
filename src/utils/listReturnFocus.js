function makeKey(location) {
  return `listFocus:${location?.pathname || ''}${location?.search || ''}`;
}

export function rememberListFocus(location, itemId) {
  if (!location || itemId == null) return;

  try {
    const payload = {
      itemId: String(itemId),
      scrollY: window.scrollY,
      ts: Date.now(),
    };

    sessionStorage.setItem(makeKey(location), JSON.stringify(payload));
  } catch {
    // ignore storage failures
  }
}

export function consumeListFocus(location) {
  if (!location) return null;

  try {
    const raw = sessionStorage.getItem(makeKey(location));
    if (!raw) return null;

    sessionStorage.removeItem(makeKey(location));

    const parsed = JSON.parse(raw);
    if (!parsed?.itemId) return null;
    if (Date.now() - (parsed.ts || 0) > 10 * 60 * 1000) return null;

    return parsed;
  } catch {
    return null;
  }
}
