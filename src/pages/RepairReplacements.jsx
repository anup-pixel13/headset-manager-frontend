import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import {
  getTempReplacements,
  rehandoverRepairedHeadset,
  closeReplacementAgentExit,
} from '../services/repairService';
import { useAuth } from '../auth/AuthContext';
import SmartPagination from '../components/SmartPagination';

import './RepairReplacements.css';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 9;
const LIMIT_OPTIONS = [6, 9, 12, 15, 30, 60, 90];

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DEFAULT_TODAY = toIso(new Date());
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
const DEFAULT_START = toIso(oneYearAgo);

function toPosInt(v, fallback) {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const getStateChip = (row, tab) => {
  if (tab === 'inactive' || row?.isActive === false || row?.returnDate) {
    return { label: 'Completed', tone: 'muted' };
  }
  if (!row?.parentAssignmentId) {
    return { label: 'Missing Link', tone: 'danger' };
  }
  if (!row?.originalRepair?.receivedAt) {
    return { label: 'Waiting Receive', tone: 'warn' };
  }
  if (row?.readyForRehandover) {
    return { label: 'Ready for Rehandover', tone: 'ok' };
  }
  return { label: 'In Progress', tone: 'muted' };
};

// ---------------------------
// Agent Exit Modal — sticky header + scrollable body + sticky footer
// ---------------------------
function AgentExitModal({ open, loading, row, onClose, onSubmit }) {
  const [reason, setReason] = useState('terminated');
  const [received, setReceived] = useState(true);
  const [condition, setCondition] = useState('good');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason('terminated');
    setReceived(true);
    setCondition('good');
    setNotes('');
  }, [open]);

  useEffect(() => {
    if (!received) setCondition('lost');
    else if (condition === 'lost') setCondition('good');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [received]);

  // Escape key + body scroll lock
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, loading, onClose]);

  if (!open || !row) return null;

  return (
    <div className="rr-modal-backdrop" onClick={onClose}>
      <div className="rr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rr-modal-header">
          <h3 style={{ margin: 0 }}>Agent Exit</h3>
          <button className="rr-modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="rr-modal-body">
          <div className="rr-modal-meta" style={{ fontWeight: 700 }}>
            <div>
              <b>Agent:</b> {row?.agent?.name} ({row?.agent?.employeeId || '—'})
            </div>
            <div>
              <b>Original:</b> {row?.originalHeadset?.number || '—'} ({row?.originalHeadset?.status || ''})
            </div>
            <div>
              <b>Temp:</b> {row?.tempHeadset?.number || '—'} ({row?.tempHeadset?.status || ''})
            </div>
            <div>
              <b>Temp Assignment:</b> #{row?.tempAssignmentId || '—'} | <b>Parent:</b> #{row?.parentAssignmentId || '—'}
            </div>
          </div>

          <div className="rr-field">
            <label>Exit reason *</label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} disabled={loading}>
              <option value="abscond">Abscond</option>
              <option value="resign">Resign</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>

          <div className="rr-field">
            <label>Temp headset received back? *</label>
            <div className="rr-radio-row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
                <input type="radio" checked={received === true} onChange={() => setReceived(true)} disabled={loading} />
                Yes
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
                <input type="radio" checked={received === false} onChange={() => setReceived(false)} disabled={loading} />
                No (Not received)
              </label>
            </div>
          </div>

          <div className="rr-field">
            <label>Temp return condition *</label>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} disabled={loading || !received}>
              <option value="good">good</option>
              <option value="fair">fair</option>
              <option value="damaged">damaged</option>
              <option value="lost" disabled={received}>
                lost
              </option>
            </select>
            {!received && <div className="rr-hint">Temp headset not received → will be marked lost.</div>}
          </div>

          <div className="rr-field">
            <label>Notes (optional)</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes..." disabled={loading} />
          </div>

          <div className="rr-inline-warn">
            This will:
            <ul style={{ margin: '8px 0 0 18px' }}>
              <li>Close temp replacement assignment</li>
              <li>Update temp headset status (available/damaged/lost)</li>
              <li>Close the permanent assignment and clear hold</li>
              <li>Create deassignment + refund request</li>
            </ul>
          </div>
        </div>

        <div className="rr-modal-footer">
          <button className="rr-action-btn secondary" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="rr-action-btn danger"
            type="button"
            disabled={loading}
            onClick={() =>
              onSubmit({
                parent_assignment_id: Number(row.parentAssignmentId),
                temp_headset_received: received,
                temp_return_condition: received ? condition : 'lost',
                reason,
                notes: notes || null,
              })
            }
          >
            {loading ? 'Saving...' : 'Confirm Agent Exit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------
// Rehandover Modal — sticky header + scrollable body + sticky footer
// ---------------------------
function RehandoverModal({ open, loading, row, form, setForm, onClose, onSubmit }) {
  // Escape key + body scroll lock
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, loading, onClose]);

  if (!open || !row) return null;

  return (
    <div className="rr-modal-backdrop" onClick={onClose}>
      <div className="rr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rr-modal-header">
          <h3 style={{ margin: 0 }}>Rehandover Repaired Headset</h3>
          <button className="rr-modal-close" type="button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="rr-modal-body">
          <div className="rr-modal-meta" style={{ fontWeight: 700 }}>
            <div>
              <b>Agent:</b> {row?.agent?.name} ({row?.agent?.employeeId || '—'})
            </div>
            <div>
              <b>Original:</b> {row?.originalHeadset?.number || '—'} ({row?.originalHeadset?.status || ''})
            </div>
            <div>
              <b>Temp:</b> {row?.tempHeadset?.number || '—'}
            </div>
            <div>
              <b>Parent Assignment:</b> #{row?.parentAssignmentId || '—'}
            </div>
          </div>

          <div className="rr-field">
            <label>Condition after repair *</label>
            <select
              value={form.condition_after}
              onChange={(e) => setForm((p) => ({ ...p, condition_after: e.target.value }))}
              disabled={loading}
            >
              <option value="good">good</option>
              <option value="fair">fair</option>
            </select>
          </div>

          <div className="rr-field">
            <label>Notes (optional)</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Any remarks..."
              disabled={loading}
            />
          </div>

          <div className="rr-inline-warn">
            Rehandover is allowed only after the original headset is received from the repair lot.
          </div>
        </div>

        <div className="rr-modal-footer">
          <button className="rr-action-btn secondary" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="rr-action-btn" type="button" onClick={onSubmit} disabled={loading}>
            {loading ? 'Submitting...' : 'Confirm Rehandover'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RepairReplacements() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: authLoading } = useAuth();

  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const urlInitializedRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);
  const didFilterOnceRef = useRef(false);
  const lastKeyRef = useRef('');
  const tableCardRef = useRef(null);

  const initial = useMemo(() => {
    const tab = searchParams.get('tab') === 'inactive' ? 'inactive' : 'active';
    const search = searchParams.get('search') || '';
    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const sortBy = searchParams.get('sortBy') || 'id';
    const sortOrder = searchParams.get('sortOrder') === 'ASC' ? 'ASC' : 'DESC';
    const page = toPosInt(searchParams.get('page'), DEFAULT_PAGE);
    const limit = toPosInt(searchParams.get('limit'), DEFAULT_LIMIT);
    return { tab, search, startDate, endDate, sortBy, sortOrder, page, limit };
  }, [searchParams]);

  const [tab, setTab] = useState(initial.tab);
  const [search, setSearch] = useState(initial.search);
  const [dateFilter, setDateFilter] = useState({ startDate: initial.startDate, endDate: initial.endDate });
  const [sortBy, setSortBy] = useState(initial.sortBy);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);
  const [page, setPage] = useState(initial.page);
  const [limit, setLimit] = useState(initial.limit);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Rehandover modal state
  const [rehandoverOpen, setRehandoverOpen] = useState(false);
  const [rehandoverLoading, setRehandoverLoading] = useState(false);
  const [rehandoverRow, setRehandoverRow] = useState(null);
  const [rehandoverForm, setRehandoverForm] = useState({ condition_after: 'good', notes: '' });

  // Agent exit modal state
  const [agentExitOpen, setAgentExitOpen] = useState(false);
  const [agentExitLoading, setAgentExitLoading] = useState(false);
  const [agentExitRow, setAgentExitRow] = useState(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [authLoading, isAdmin, navigate]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  useEffect(() => {
    if (prevPageRef.current === null) prevPageRef.current = initial.page;
  }, [initial.page]);

  // URL -> state
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      urlInitializedRef.current = true;
      return;
    }
    isSyncingFromUrlRef.current = true;

    const nextTab = searchParams.get('tab') === 'inactive' ? 'inactive' : 'active';
    const nextSearch = searchParams.get('search') || '';
    const nextStartDate = searchParams.get('startDate') || DEFAULT_START;
    const nextEndDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const nextSortBy = searchParams.get('sortBy') || 'id';
    const nextSortOrder = searchParams.get('sortOrder') === 'ASC' ? 'ASC' : 'DESC';
    const nextPage = toPosInt(searchParams.get('page'), DEFAULT_PAGE);
    const nextLimit = toPosInt(searchParams.get('limit'), DEFAULT_LIMIT);

    setTab(nextTab);
    setSearch(nextSearch);
    setDateFilter({ startDate: nextStartDate, endDate: nextEndDate });
    setSortBy(nextSortBy);
    setSortOrder(nextSortOrder);
    setPage(nextPage);
    setLimit(nextLimit);
    prevPageRef.current = nextPage;

    queueMicrotask(() => (isSyncingFromUrlRef.current = false));
  }, [searchParams]);

  // state -> URL
  useEffect(() => {
    if (isSyncingFromUrlRef.current || !urlInitializedRef.current) return;

    const p = new URLSearchParams();
    p.set('tab', tab);
    if (search) p.set('search', search);
    p.set('startDate', dateFilter.startDate || DEFAULT_START);
    p.set('endDate', dateFilter.endDate || DEFAULT_TODAY);
    if (sortBy !== 'id') p.set('sortBy', sortBy);
    if (sortOrder !== 'DESC') p.set('sortOrder', sortOrder);
    p.set('page', String(page));
    if (limit !== DEFAULT_LIMIT) p.set('limit', String(limit));

    if (p.toString() !== searchParams.toString()) {
      const pageChanged = prevPageRef.current !== page;
      const shouldPush = isUserPageChangeRef.current && pageChanged;
      setSearchParams(p, { replace: !shouldPush });
      prevPageRef.current = page;
      isUserPageChangeRef.current = false;
    }
  }, [tab, search, dateFilter.startDate, dateFilter.endDate, sortBy, sortOrder, page, limit, setSearchParams, searchParams]);

  // Reset page when filters change
  useEffect(() => {
    const key = `${tab}||${search}||${dateFilter.startDate}||${dateFilter.endDate}||${sortBy}||${sortOrder}`;
    const keyChanged = lastKeyRef.current !== key;

    if (didFilterOnceRef.current && keyChanged && !isSyncingFromUrlRef.current) {
      isUserPageChangeRef.current = false;
      setPage(1);
    }

    didFilterOnceRef.current = true;
    lastKeyRef.current = key;
  }, [tab, search, dateFilter.startDate, dateFilter.endDate, sortBy, sortOrder]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const load = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await getTempReplacements({
        status: tab,
        search: debouncedSearch,
        start_date: dateFilter.startDate,
        end_date: dateFilter.endDate,
        sort_by: sortBy,
        page,
        limit,
        sort_order: sortOrder,
      });

      setRows(res.data?.data || []);
      setTotal(res.data?.pagination?.total ?? 0);
    } catch (e) {
      console.error(e);
      setRows([]);
      setTotal(0);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load temp replacements.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedSearch, dateFilter.startDate, dateFilter.endDate, sortBy, sortOrder, page, limit]);

  // Rehandover
  const openRehandover = (row) => {
    setMessage({ type: '', text: '' });
    setRehandoverRow(row);
    setRehandoverForm({ condition_after: 'good', notes: '' });
    setRehandoverOpen(true);
  };

  const closeRehandover = () => {
    if (rehandoverLoading) return;
    setRehandoverOpen(false);
    setRehandoverRow(null);
  };

  const submitRehandover = async () => {
    if (!rehandoverRow?.parentAssignmentId) {
      setMessage({ type: 'error', text: 'Missing parentAssignmentId for this replacement row.' });
      return;
    }

    try {
      setRehandoverLoading(true);
      setMessage({ type: '', text: '' });

      const res = await rehandoverRepairedHeadset({
        parent_assignment_id: Number(rehandoverRow.parentAssignmentId),
        condition_after: rehandoverForm.condition_after,
        notes: rehandoverForm.notes,
      });

      setMessage({ type: 'success', text: res.data?.message || 'Rehandover completed.' });
      setRehandoverOpen(false);
      setRehandoverRow(null);
      await load();
    } catch (e) {
      console.error(e);
      setMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Failed to rehandover. Receive original headset from repair lot first.',
      });
    } finally {
      setRehandoverLoading(false);
    }
  };

  // Agent exit
  const openAgentExit = (row) => {
    setMessage({ type: '', text: '' });
    setAgentExitRow(row);
    setAgentExitOpen(true);
  };

  const closeAgentExit = () => {
    if (agentExitLoading) return;
    setAgentExitOpen(false);
    setAgentExitRow(null);
  };

  const submitAgentExit = async (payload) => {
    try {
      setAgentExitLoading(true);
      setMessage({ type: '', text: '' });

      const res = await closeReplacementAgentExit(payload);

      setMessage({ type: 'success', text: res.data?.message || 'Agent exit saved.' });
      setAgentExitOpen(false);
      setAgentExitRow(null);

      await load();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to save agent exit.' });
    } finally {
      setAgentExitLoading(false);
    }
  };

  // Export
  const mapRow = (r) => ({
    'Temp Assignment ID': r.tempAssignmentId,
    'Parent Assignment ID': r.parentAssignmentId || '',
    Agent: r.agent?.name || '',
    'Employee ID': r.agent?.employeeId || '',
    Process: r.process?.name || '',
    'Original Headset': r.originalHeadset?.number || '',
    'Original Status': r.originalHeadset?.status || '',
    'Temp Headset': r.tempHeadset?.number || '',
    'Temp Status': r.tempHeadset?.status || '',
    'Lot Code': r.originalRepair?.lotCode || '',
    'Lot Status': r.originalRepair?.lotStatus || '',
    'Repair Received At': r.originalRepair?.receivedAt ? new Date(r.originalRepair.receivedAt).toLocaleString() : '',
    'Start Date': r.assignmentDate ? new Date(r.assignmentDate).toLocaleString() : '',
    'End Date': r.returnDate ? new Date(r.returnDate).toLocaleString() : '',
    State: getStateChip(r, tab).label,
  });

  const exportPageToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map(mapRow));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Page_${page}`);
    XLSX.writeFile(wb, `RepairReplacements_${tab}_Page_${page}.xlsx`);
  };

  const exportFilteredAllPages = async () => {
    try {
      setMessage({ type: '', text: '' });

      const MAX_LIMIT = 100;
      let p = 1;
      let collected = [];

      while (true) {
        const res = await getTempReplacements({
          status: tab,
          search: debouncedSearch,
          start_date: dateFilter.startDate,
          end_date: dateFilter.endDate,
          sort_by: sortBy,
          page: p,
          limit: MAX_LIMIT,
          sort_order: sortOrder,
        });

        const batch = res.data?.data || [];
        collected = collected.concat(batch);

        const t = res.data?.pagination?.total ?? collected.length;
        if (collected.length >= t) break;

        p += 1;
        if (p > 200) break;
      }

      const ws = XLSX.utils.json_to_sheet(collected.map(mapRow));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'RepairReplacements');
      XLSX.writeFile(wb, `RepairReplacements_${tab}_Filtered.xlsx`);

      setMessage({ type: 'success', text: `Exported ${collected.length} rows.` });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Export failed.' });
    }
  };

  return (
    <div className="rr-container">
      <div className="container rr-content">
        <div className="rr-top-nav">
          <button className="rr-btn-back" onClick={() => navigate('/dashboard')} type="button">
            <i className="bi bi-arrow-left" /> <span>Back to Dashboard</span>
          </button>

          <div className="rr-top-actions">
            <button className="rr-top-btn" onClick={load} type="button">
              Refresh
            </button>
            <button className="rr-top-btn secondary" onClick={() => navigate('/repairs/start')} type="button">
              Start Replacement
            </button>
            <button className="rr-top-btn secondary" onClick={() => navigate('/repairs')} type="button">
              Repair Lots
            </button>
          </div>
        </div>

        <div className="rr-header-card">
          <div className="rr-header-left">
            <h1 className="rr-title">
              <i className="bi bi-wrench-adjustable-circle" /> Repair Replacements
            </h1>
            <p className="rr-subtitle">Track temp replacements, rehandover repaired headsets, or close on agent exit.</p>
          </div>

          <div className="rr-header-stats">
            <div className="rr-stat-mini">
              <span className="rr-stat-mini-value">{total}</span>
              <span className="rr-stat-mini-label">Total</span>
            </div>
            <div className="rr-stat-mini">
              <span className="rr-stat-mini-value">{tab === 'active' ? 'Active' : 'Inactive'}</span>
              <span className="rr-stat-mini-label">Tab</span>
            </div>
          </div>
        </div>

        {message.text && <div className={`rr-alert ${message.type}`}>{message.text}</div>}

        <div className="rr-tabs">
          <button
            className={`rr-tab ${tab === 'active' ? 'active' : ''}`}
            onClick={() => {
              isUserPageChangeRef.current = false;
              setPage(1);
              setTab('active');
            }}
            type="button"
          >
            Active
          </button>
          <button
            className={`rr-tab ${tab === 'inactive' ? 'active' : ''}`}
            onClick={() => {
              isUserPageChangeRef.current = false;
              setPage(1);
              setTab('inactive');
            }}
            type="button"
          >
            Inactive
          </button>
        </div>

        <div className="rr-filters-card">
          <div className="rr-filters-row">
            <div className="rr-search-wrapper">
              <i className="bi bi-search" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  isUserPageChangeRef.current = false;
                  setSearch(e.target.value);
                }}
                placeholder="Search agent / emp id / temp headset # / original headset #"
              />
              {search && (
                <button
                  className="rr-search-clear"
                  type="button"
                  onClick={() => {
                    isUserPageChangeRef.current = false;
                    setSearch('');
                  }}
                  title="Clear"
                >
                  <i className="bi bi-x-circle-fill" />
                </button>
              )}
            </div>

            <input
              type="date"
              className="rr-select"
              value={dateFilter.startDate}
              onChange={(e) => {
                isUserPageChangeRef.current = false;
                setDateFilter((prev) => ({ ...prev, startDate: e.target.value }));
              }}
              title="Start date"
            />
            <input
              type="date"
              className="rr-select"
              value={dateFilter.endDate}
              onChange={(e) => {
                isUserPageChangeRef.current = false;
                setDateFilter((prev) => ({ ...prev, endDate: e.target.value }));
              }}
              title="End date"
            />

            <select
              className="rr-select"
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split(':');
                isUserPageChangeRef.current = false;
                setSortBy(by);
                setSortOrder(order);
              }}
              title="Sort"
            >
              <option value="id:DESC">ID ↓</option>
              <option value="id:ASC">ID ↑</option>
              <option value="assignmentDate:DESC">Date ↓</option>
              <option value="assignmentDate:ASC">Date ↑</option>
              <option value="returnDate:DESC">Return Date ↓</option>
              <option value="returnDate:ASC">Return Date ↑</option>
            </select>

            <select
              className="rr-select"
              value={limit}
              onChange={(e) => {
                isUserPageChangeRef.current = false;
                setLimit(toPosInt(e.target.value, DEFAULT_LIMIT));
              }}
              title="Items per page"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>

            <div className="rr-actions">
              <button className="rr-action-btn filtered" type="button" onClick={exportFilteredAllPages} disabled={total === 0}>
                <i className="bi bi-funnel" /> Export Filtered ({total})
              </button>
              <button className="rr-action-btn secondary" type="button" onClick={exportPageToExcel} disabled={rows.length === 0}>
                <i className="bi bi-file-earmark" /> Export Page ({rows.length})
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rr-loading">
            <div className="rr-spinner" />
            <p>Loading replacements...</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="rr-empty">
            <i className="bi bi-inbox" />
            <h3>No records</h3>
            <p>Try adjusting search or switching tabs.</p>
          </div>
        ) : (
          <>
            <div className="rr-table-card" ref={tableCardRef}>
              <table className="rr-table">
                <thead>
                  <tr>
                    <th>Temp Assignment</th>
                    <th>Agent</th>
                    <th>Original Headset</th>
                    <th>Temp Headset</th>
                    <th>Process</th>
                    <th>Hold</th>
                    <th>Dates</th>
                    <th>State</th>
                    {tab === 'active' && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = getStateChip(r, tab);
                    const canRehandover = tab === 'active' && r?.readyForRehandover === true;

                    return (
                      <tr key={r.tempAssignmentId}>
                        <td>
                          <b>#{r.tempAssignmentId}</b>
                          <div className="rr-muted">Parent #{r.parentAssignmentId || '—'}</div>
                        </td>
                        <td>
                          {r.agent?.name}
                          <div className="rr-muted">{r.agent?.employeeId || '—'}</div>
                        </td>
                        <td>
                          {r.originalHeadset?.number || '—'}
                          <div className="rr-muted">{r.originalHeadset?.status || ''}</div>
                          {r.originalRepair?.lotCode && (
                            <div className="rr-muted">
                              Lot: {r.originalRepair.lotCode} ({r.originalRepair.lotStatus || ''})
                            </div>
                          )}
                        </td>
                        <td>
                          {r.tempHeadset?.number}
                          <div className="rr-muted">{r.tempHeadset?.status}</div>
                        </td>
                        <td>{r.process?.name || '—'}</td>
                        <td>
                          {r.originalHold?.status || '—'}
                          <div className="rr-muted">
                            {r.originalHold?.holdStartedAt ? new Date(r.originalHold.holdStartedAt).toLocaleString() : ''}
                          </div>
                        </td>
                        <td className="rr-small">
                          <div>
                            <b>Start:</b> {r.assignmentDate ? new Date(r.assignmentDate).toLocaleString() : '—'}
                          </div>
                          <div>
                            <b>End:</b> {r.returnDate ? new Date(r.returnDate).toLocaleString() : '—'}
                          </div>
                        </td>
                        <td>
                          <span className={`rr-pill ${st.tone}`}>{st.label}</span>
                          {r.originalRepair?.receivedAt && (
                            <div className="rr-muted" style={{ marginTop: 4 }}>
                              Received: {new Date(r.originalRepair.receivedAt).toLocaleString()}
                            </div>
                          )}
                        </td>

                        {tab === 'active' && (
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div className="rr-action-col">
                              <button
                                className="rr-table-btn"
                                type="button"
                                onClick={() => openRehandover(r)}
                                disabled={!canRehandover}
                                title={!canRehandover ? 'Waiting receive from repair lot (or missing link)' : ''}
                              >
                                Rehandover
                              </button>
                              <button
                                className="rr-table-btn danger"
                                type="button"
                                onClick={() => openAgentExit(r)}
                                title="Close temp replacement when agent abscond/resign/terminated."
                              >
                                Agent Exit
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <SmartPagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(targetPage, anchor) => {
                    void anchor;
                  isUserPageChangeRef.current = true;
                  setPage(targetPage);
                }}
                scrollTargetRef={tableCardRef}
                className="rr-pagination-card"
              />
            )}
          </>
        )}

        {/* Rehandover modal */}
        {rehandoverOpen && (
          <RehandoverModal
            open={rehandoverOpen}
            loading={rehandoverLoading}
            row={rehandoverRow}
            form={rehandoverForm}
            setForm={setRehandoverForm}
            onClose={closeRehandover}
            onSubmit={submitRehandover}
          />
        )}

        <AgentExitModal
          open={agentExitOpen}
          loading={agentExitLoading}
          row={agentExitRow}
          onClose={closeAgentExit}
          onSubmit={submitAgentExit}
        />
      </div>
    </div>
  );
}