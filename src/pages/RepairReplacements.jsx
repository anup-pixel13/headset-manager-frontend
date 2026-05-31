import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import {
  getTempReplacements,
  rehandoverRepairedHeadset,
  closeReplacementAgentExit,
} from '../services/repairService';
import { useAuth } from '../auth/AuthContext';

import './RepairReplacements.css';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const LIMIT_OPTIONS = [10, 20, 30, 50, 100];

function toPosInt(v, fallback) {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
// Agent Exit Modal (unchanged behavior; only uses existing classes)
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

  if (!open || !row) return null;

  return (
    <div className="rr-modal-backdrop" onClick={onClose}>
      <div className="rr-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 95vw)' }}>
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

        <div className="rr-modal-actions">
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

export default function RepairReplacements() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: authLoading } = useAuth();

  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);
  const pendingScrollActionRef = useRef(null);

  const initial = useMemo(() => {
    return {
      tab: searchParams.get('tab') === 'inactive' ? 'inactive' : 'active',
      search: searchParams.get('search') || '',
      page: toPosInt(searchParams.get('page'), DEFAULT_PAGE),
      limit: toPosInt(searchParams.get('limit'), DEFAULT_LIMIT),
    };
  }, [searchParams]);

  const [tab, setTab] = useState(initial.tab);
  const [search, setSearch] = useState(initial.search);
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
      return;
    }
    isSyncingFromUrlRef.current = true;

    const nextTab = searchParams.get('tab') === 'inactive' ? 'inactive' : 'active';
    const nextSearch = searchParams.get('search') || '';
    const nextPage = toPosInt(searchParams.get('page'), DEFAULT_PAGE);
    const nextLimit = toPosInt(searchParams.get('limit'), DEFAULT_LIMIT);

    setTab(nextTab);
    setSearch(nextSearch);
    setPage(nextPage);
    setLimit(nextLimit);
    prevPageRef.current = nextPage;

    queueMicrotask(() => (isSyncingFromUrlRef.current = false));
  }, [searchParams]);

  // state -> URL
  useEffect(() => {
    if (isSyncingFromUrlRef.current) return;

    const p = new URLSearchParams();
    p.set('tab', tab);
    if (search) p.set('search', search);
    p.set('page', String(page));
    if (limit !== DEFAULT_LIMIT) p.set('limit', String(limit));

    if (p.toString() !== searchParams.toString()) {
      const pageChanged = prevPageRef.current !== page;
      const shouldPush = isUserPageChangeRef.current && pageChanged;

      setSearchParams(p, { replace: !shouldPush });
      prevPageRef.current = page;
      isUserPageChangeRef.current = false;
    }
  }, [tab, search, page, limit, setSearchParams, searchParams]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // scroll helper
  useEffect(() => {
    if (!pendingScrollActionRef.current || loading) return;
    const action = pendingScrollActionRef.current;
    pendingScrollActionRef.current = null;

    setTimeout(() => {
      if (action === 'top') {
        const tableWrapper = document.querySelector('.rr-table-card');
        if (tableWrapper) {
          const headerOffset = 150;
          const elementPosition = tableWrapper.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
        }
      }
    }, 100);
  }, [page, loading]);

  const load = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await getTempReplacements({
        status: tab,
        search,
        page,
        limit,
        sort_order: 'DESC',
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
  }, [tab, search, page, limit]);

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

  // Pagination numbers
  const getPageNumbers = () => {
    const nums = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) nums.push(i);
    } else {
      if (page <= 3) {
        for (let i = 1; i <= 4; i++) nums.push(i);
        nums.push('...');
        nums.push(totalPages);
      } else if (page >= totalPages - 2) {
        nums.push(1);
        nums.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) nums.push(i);
      } else {
        nums.push(1);
        nums.push('...');
        nums.push(page - 1);
        nums.push(page);
        nums.push(page + 1);
        nums.push('...');
        nums.push(totalPages);
      }
    }
    return nums;
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
          search,
          page: p,
          limit: MAX_LIMIT,
          sort_order: 'DESC',
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
                  setPage(1);
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
                    setPage(1);
                    setSearch('');
                  }}
                  title="Clear"
                >
                  <i className="bi bi-x-circle-fill" />
                </button>
              )}
            </div>

            <select
              className="rr-select"
              value={limit}
              onChange={(e) => {
                isUserPageChangeRef.current = false;
                setPage(1);
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
            <div className="rr-table-card">
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
              <div className="rr-pagination-card">
                <button
                  className="rr-page-btn"
                  type="button"
                  onClick={() => {
                    if (page === 1) return;
                    isUserPageChangeRef.current = true;
                    pendingScrollActionRef.current = 'top';
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  disabled={page === 1}
                >
                  <i className="bi bi-chevron-left" /> Previous
                </button>

                <div className="rr-page-numbers">
                  {getPageNumbers().map((n, idx) =>
                    n === '...' ? (
                      <span key={`${n}-${idx}`} className="rr-page-dots">
                        ...
                      </span>
                    ) : (
                      <button
                        key={String(n)}
                        className={`rr-page-num ${Number(n) === page ? 'active' : ''}`}
                        type="button"
                        onClick={() => {
                          if (Number(n) === page) return;
                          isUserPageChangeRef.current = true;
                          pendingScrollActionRef.current = 'top';
                          setPage(Number(n));
                        }}
                      >
                        {n}
                      </button>
                    )
                  )}
                </div>

                <button
                  className="rr-page-btn"
                  type="button"
                  onClick={() => {
                    if (page === totalPages) return;
                    isUserPageChangeRef.current = true;
                    pendingScrollActionRef.current = 'top';
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                  disabled={page === totalPages}
                >
                  Next <i className="bi bi-chevron-right" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Rehandover modal */}
        {rehandoverOpen && (
          <div className="rr-modal-backdrop" onClick={closeRehandover}>
            <div className="rr-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 95vw)' }}>
              <div className="rr-modal-header">
                <h3 style={{ margin: 0 }}>Rehandover Repaired Headset</h3>
                <button className="rr-modal-close" type="button" onClick={closeRehandover}>
                  ×
                </button>
              </div>

              <div className="rr-modal-body">
                <div className="rr-modal-meta" style={{ fontWeight: 700 }}>
                  <div>
                    <b>Agent:</b> {rehandoverRow?.agent?.name} ({rehandoverRow?.agent?.employeeId || '—'})
                  </div>
                  <div>
                    <b>Original:</b> {rehandoverRow?.originalHeadset?.number || '—'} ({rehandoverRow?.originalHeadset?.status || ''})
                  </div>
                  <div>
                    <b>Temp:</b> {rehandoverRow?.tempHeadset?.number || '—'}
                  </div>
                  <div>
                    <b>Parent Assignment:</b> #{rehandoverRow?.parentAssignmentId || '—'}
                  </div>
                </div>

                <div className="rr-field">
                  <label>Condition after repair *</label>
                  <select
                    value={rehandoverForm.condition_after}
                    onChange={(e) => setRehandoverForm((p) => ({ ...p, condition_after: e.target.value }))}
                    disabled={rehandoverLoading}
                  >
                    <option value="good">good</option>
                    <option value="fair">fair</option>
                  </select>
                </div>

                <div className="rr-field">
                  <label>Notes (optional)</label>
                  <textarea
                    rows={3}
                    value={rehandoverForm.notes}
                    onChange={(e) => setRehandoverForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Any remarks..."
                    disabled={rehandoverLoading}
                  />
                </div>

                <div className="rr-inline-warn">
                  Rehandover is allowed only after the original headset is received from the repair lot.
                </div>
              </div>

              <div className="rr-modal-actions">
                <button className="rr-action-btn secondary" type="button" onClick={closeRehandover} disabled={rehandoverLoading}>
                  Cancel
                </button>
                <button className="rr-action-btn" type="button" onClick={submitRehandover} disabled={rehandoverLoading}>
                  {rehandoverLoading ? 'Submitting...' : 'Confirm Rehandover'}
                </button>
              </div>
            </div>
          </div>
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