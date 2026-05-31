// Centralized display + validation rules for headset naming/type/brand in UI

export const HEADSET_TYPE_LABELS = {
  voix_enc: 'VOIX (ENC)',
  voix_2xx: 'VOIX (Non‑ENC 2xx)',
  voix_3xx: 'VOIX (Non‑ENC 3xx)',
  voix_nxx: 'VOIX (Non‑ENC N‑series)',
  voix_xxx: 'VOIX (Non‑ENC)',

  tech: 'TECH',
  ojt: 'OJT',
  yjack: 'Y‑Jack',
};

export const HEADSET_TYPE_HELP = {
  voix_enc: 'Formats: ENC 01…ENC 9999 | ENC 01*…ENC 9999* | ENC R01*…ENC R9999*',
  voix_2xx: 'Format: 200–299 (3 digits)',
  voix_3xx: 'Format: 300–399 (3 digits)',
  voix_nxx: 'Format: N1…N9999 (N + 1–4 digits)',
  voix_xxx: 'Format: 01–199 OR 400–9999 (1–4 digits; leading zeros allowed)',

  tech: 'Format: TECH 01…TECH 9999 (TECH + 2–4 digits)',
  ojt: 'Format: OJT 01 (OJT + 2 digits)',
  yjack: 'Format: YJACK 01 (YJACK + 2 digits)',
};

export const HEADSET_TYPE_REGEX = {
  // Accept:
  // ENC 01..9999
  // ENC 01*..9999*
  // ENC R01*..R9999*
  voix_enc: /^ENC\s(?:R\d{2,4}\*|\d{2,4}\*?)$/i,

  voix_2xx: /^\d{3}$/,
  voix_3xx: /^\d{3}$/,

  // N1..N9999 (1–4 digits)
  voix_nxx: /^N\d{1,4}$/i,

  // 01..199 or 400..9999 (1–4 digits, range validated below)
  voix_xxx: /^\d{1,4}$/,

  // TECH 01..TECH 9999 (2–4 digits)
  tech: /^TECH\s\d{2,4}$/i,

  ojt: /^OJT\s\d{2}$/i,
  yjack: /^YJACK\s\d{2}$/i,
};

export function normalizeHeadsetNumber(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

export function formatHeadsetType(type) {
  return HEADSET_TYPE_LABELS[type] || (type ? String(type).toUpperCase() : 'N/A');
}

function parseDigitsAsInt(digits) {
  // '01' -> 1, '0007' -> 7
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function isValidHeadsetNumberForType(headsetNumber, headsetType) {
  const normalized = normalizeHeadsetNumber(headsetNumber);

  const re = HEADSET_TYPE_REGEX[headsetType];
  if (!re) return { ok: false, normalized, reason: 'Please select a headset type.' };

  if (!re.test(normalized)) {
    return {
      ok: false,
      normalized,
      reason: `Invalid headset number for ${formatHeadsetType(headsetType)}. ${HEADSET_TYPE_HELP[headsetType] || ''}`.trim(),
    };
  }

  // Range guards
  if (headsetType === 'voix_2xx') {
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 200 || n > 299) {
      return { ok: false, normalized, reason: 'VOIX (Non‑ENC 2xx) must be between 200 and 299.' };
    }
  }

  if (headsetType === 'voix_3xx') {
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 300 || n > 399) {
      return { ok: false, normalized, reason: 'VOIX (Non‑ENC 3xx) must be between 300 and 399.' };
    }
  }

  if (headsetType === 'voix_xxx') {
    const n = parseDigitsAsInt(normalized);
    if (n === null) return { ok: false, normalized, reason: 'Invalid number.' };

    const ok = (n >= 1 && n <= 199) || (n >= 400 && n <= 9999);
    if (!ok) {
      return { ok: false, normalized, reason: 'VOIX (Non‑ENC) must be 01–199 or 400–9999.' };
    }
  }

  if (headsetType === 'voix_nxx') {
    const m = normalized.match(/^N(\d{1,4})$/i);
    const digits = m?.[1] || '';
    const n = parseDigitsAsInt(digits);
    if (n === null || n < 1 || n > 9999) {
      return { ok: false, normalized, reason: 'N‑series must be N1 to N9999.' };
    }
  }

  if (headsetType === 'voix_enc') {
    const m = normalized.match(/^ENC\s(?:R)?(\d{2,4})\*?$/i);
    const digits = m?.[1] || '';
    const n = parseDigitsAsInt(digits);
    if (n === null || n < 1 || n > 9999) {
      return { ok: false, normalized, reason: 'ENC number must be between 01 and 9999.' };
    }
  }

  if (headsetType === 'tech') {
    const m = normalized.match(/^TECH\s(\d{2,4})$/i);
    const digits = m?.[1] || '';
    const n = parseDigitsAsInt(digits);
    if (n === null || n < 1 || n > 9999) {
      return { ok: false, normalized, reason: 'TECH number must be TECH 01 to TECH 9999.' };
    }
  }

  return { ok: true, normalized, reason: '' };
}

export function formatBrandName(brandName) {
  const v = String(brandName || '').trim();
  if (!v) return 'N/A';
  return v.toUpperCase();
}