import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SearchableSelect.css';

/**
 * SearchableSelect
 * - controlled: value + onChange
 * - supports async search via onSearch(query) => Promise<options[]>
 * - options: [{ value, label, meta }]
 */
export default function SearchableSelect({
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
  minChars = 0,
  debounceMs = 250,
  onSearch, // async (q) => options[]
  getOptionLabel, // (opt) => string (optional)
  renderOption, // (opt) => ReactNode (optional)
  noResultsText = 'No results',
  loadingText = 'Loading...',
  clearable = true,
}) {
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // prevents out-of-order async results from overwriting new results
  const requestSeqRef = useRef(0);

  // cache the last selected option so label stays visible even if opts resets
  const lastSelectedRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  const labelOf = (opt) => {
    if (!opt) return '';
    if (getOptionLabel) return getOptionLabel(opt);
    return String(opt.label ?? opt.value ?? '');
  };

  const normalize = (s) => String(s || '').toLowerCase().trim();

  // simple "closest match" scoring:
  // exact > startsWith > contains (earlier index wins), then shorter label
  const scoreOption = (opt, query) => {
    const qn = normalize(query);
    const ln = normalize(labelOf(opt));
    if (!qn) return 0;

    if (ln === qn) return 1000;
    if (ln.startsWith(qn)) return 900;

    const idx = ln.indexOf(qn);
    if (idx >= 0) return 800 - idx;

    return 0;
  };

  const rankOptions = (options, query) => {
    const qn = normalize(query);
    if (!qn) return options; // keep original order for empty query

    return [...options].sort((a, b) => {
      const sa = scoreOption(a, qn);
      const sb = scoreOption(b, qn);
      if (sb !== sa) return sb - sa;

      const la = normalize(labelOf(a));
      const lb = normalize(labelOf(b));
      if (la.length !== lb.length) return la.length - lb.length;

      return la.localeCompare(lb);
    });
  };

  const selected = useMemo(() => {
    return opts.find((o) => String(o.value) === String(value)) || null;
  }, [opts, value]);

  // close on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target)) return;
      setOpen(false);
      setActiveIndex(-1);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // when selection changes, remember it so we can show label later
  useEffect(() => {
    if (selected) lastSelectedRef.current = selected;
  }, [selected]);

  // when opening, keep the input query as-is (no forced overwrite)
  useEffect(() => {
    if (!open) return;
  }, [open]);

  // search debounce + stale response guard + ranking
  useEffect(() => {
    if (!open) return;
    if (!onSearch) return;

    const query = String(q || '');

    if (query.length < minChars) {
      setOpts([]);
      setLoading(false);
      return;
    }

    const t = setTimeout(async () => {
      const seq = ++requestSeqRef.current;

      try {
        setLoading(true);

        const res = await onSearch(query);

        // ✅ ignore out-of-order responses
        if (seq !== requestSeqRef.current) return;

        const list = Array.isArray(res) ? res : [];
        setOpts(rankOptions(list, query));
      } catch (e) {
        console.error(e);
        if (seq !== requestSeqRef.current) return;
        setOpts([]);
      } finally {
        if (seq !== requestSeqRef.current) return;
        setLoading(false);
        setActiveIndex(-1);
      }
    }, debounceMs);

    return () => clearTimeout(t);
  }, [q, open, minChars, debounceMs, onSearch]);

  const commit = (opt) => {
    lastSelectedRef.current = opt || null;
    onChange?.(opt?.value ?? '');
    setOpen(false);
    setActiveIndex(-1);
    setQ('');
  };

  const displayText = useMemo(() => {
    if (open) return q;
    if (!value) return '';

    // if not open, show label of selected if we have it
    if (selected) return labelOf(selected);

    // else show cached last selected label (if matches current value)
    if (lastSelectedRef.current && String(lastSelectedRef.current.value) === String(value)) {
      return labelOf(lastSelectedRef.current);
    }

    return String(value);
  }, [open, q, value, selected]);

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        queueMicrotask(() => inputRef.current?.focus());
      }
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(opts.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = opts[activeIndex];
      if (opt) commit(opt);
    }
  };

  return (
    <div className={`ss-wrap ${disabled ? 'disabled' : ''}`} ref={wrapRef}>
      <div
        className={`ss-input ${open ? 'open' : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          queueMicrotask(() => inputRef.current?.focus());
        }}
      >
        <input
          ref={inputRef}
          value={displayText}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => {
            if (!open) setOpen(true);
            setQ(e.target.value);
          }}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />

        <div className="ss-actions">
          {clearable && !!value && !disabled && (
            <button
              type="button"
              className="ss-clear"
              onClick={(e) => {
                e.stopPropagation();
                lastSelectedRef.current = null;
                onChange?.('');
                setQ('');
                setOpts([]);
                setActiveIndex(-1);
              }}
              title="Clear"
            >
              ×
            </button>
          )}
          <span className="ss-caret">▾</span>
        </div>
      </div>

      {open && !disabled && (
        <div className="ss-menu">
          {loading ? (
            <div className="ss-item muted">{loadingText}</div>
          ) : opts.length === 0 ? (
            <div className="ss-item muted">{noResultsText}</div>
          ) : (
            opts.map((opt, idx) => (
              <div
                key={String(opt.value)}
                className={`ss-item ${idx === activeIndex ? 'active' : ''}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(e) => {
                  // mouseDown to avoid input blur closing before click
                  e.preventDefault();
                  commit(opt);
                }}
              >
                {renderOption ? renderOption(opt) : labelOf(opt)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}