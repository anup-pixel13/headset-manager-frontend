import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import SmartPagination from '../components/SmartPagination';
import { getPendingSignatures, getPendingPermanentIds } from '../services/assignmentService';
import { updateEmployeeId } from '../services/agentService';
import { useAuth } from '../auth/AuthContext';
import { useListReturnFocus } from '../hooks/useListReturnFocus';
import { rememberListFocus } from '../utils/listReturnFocus';

import './Dashboard.css';
import './PendingActions.css';

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 9;
const ITEMS_PER_PAGE_OPTIONS = [6, 9, 12, 15, 30, 60, 90];
const DEFAULT_TAB = 'signatures';
const DEFAULT_SIG_MISSING = 'all';
const DEFAULT_ID_PROCESS = 'all';
const DEFAULT_ID_STATUS = 'all';

function toPositiveInt(value, fallback) {
  const n = parseInt(value ?? '', 10);
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

function downloadXlsx(rows, sheetName, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default function PendingActions() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: authLoading } = useAuth();

  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const urlInitializedRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);

  const didSigFilterOnceRef = useRef(false);
  const lastSigKeyRef = useRef('');
  const didIdFilterOnceRef = useRef(false);
  const lastIdKeyRef = useRef('');
  const sigTableCardRef = useRef(null);
  const idTableCardRef = useRef(null);
  const sigRowRefs = useRef({});

  const initial = useMemo(() => {
    const initialTab = searchParams.get('tab') === 'ids' ? 'ids' : DEFAULT_TAB;
    const initialSearch = searchParams.get('search') || '';
    const initialPage = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const initialPerPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    return {
      tab: initialTab,
      signatures: {
        search: initialTab === 'signatures' ? initialSearch : '',
        page: initialTab === 'signatures' ? initialPage : DEFAULT_PAGE,
        perPage: initialTab === 'signatures' ? initialPerPage : DEFAULT_ITEMS_PER_PAGE,
        missing: searchParams.get('missing') || DEFAULT_SIG_MISSING,
      },
      ids: {
        search: initialTab === 'ids' ? initialSearch : '',
        page: initialTab === 'ids' ? initialPage : DEFAULT_PAGE,
        perPage: initialTab === 'ids' ? initialPerPage : DEFAULT_ITEMS_PER_PAGE,
        process: searchParams.get('process') || DEFAULT_ID_PROCESS,
        idStatus: searchParams.get('idStatus') || DEFAULT_ID_STATUS,
      },
    };
    // Read once on mount to seed initial tab/query state from URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTab] = useState(initial.tab);

  const [loading, setLoading] = useState(true);

  const [pendingSigs, setPendingSigs] = useState([]);
  const [pendingIds, setPendingIds] = useState([]);

  const [message, setMessage] = useState({ type: '', text: '' });

  const [sigSearch, setSigSearch] = useState(initial.signatures.search);
  const [sigMissingFilter, setSigMissingFilter] = useState(initial.signatures.missing);
  const [sigPage, setSigPage] = useState(initial.signatures.page);
  const [sigPerPage, setSigPerPage] = useState(initial.signatures.perPage);

  const [idSearch, setIdSearch] = useState(initial.ids.search);
  const [idProcessFilter, setIdProcessFilter] = useState(initial.ids.process);
  const [idStatusFilter, setIdStatusFilter] = useState(initial.ids.idStatus);
  const [idPage, setIdPage] = useState(initial.ids.page);
  const [idPerPage, setIdPerPage] = useState(initial.ids.perPage);

  const debouncedSigSearch = useDebouncedValue(sigSearch, 300);
  const debouncedIdSearch = useDebouncedValue(idSearch, 300);

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [newEmpId, setNewEmpId] = useState('');
  const focusedItemId = useListReturnFocus({
    ready: !loading && tab === 'signatures',
    getElementForItem: (id) => sigRowRefs.current[String(id)],
  });

  const normalizePendingIdRow = (r) => ({
    id: r.id ?? r.assignmentId ?? r.assignment_id,
    assignmentId: r.assignmentId ?? r.assignment_id ?? r.id,
    assignmentDate: r.assignmentDate ?? r.assignment_date ?? null,

    agentId: r.agentId ?? r.agent_id ?? null,
    userId: r.userId ?? r.user_id ?? null,

    agentName: r.agentName ?? r.agent_name ?? r.name ?? '',
    employeeId: r.employeeId ?? r.employee_id ?? '',
    tempEmployeeId: r.tempEmployeeId ?? r.temp_employee_id ?? '',

    process: r.process ?? r.process_name ?? '',
    headsetNumber: r.headsetNumber ?? r.headset_number ?? '',
    headsetType: r.headsetType ?? r.headset_type ?? '',

    tlName: r.tlName ?? r.tl_name ?? '',
    managerName: r.managerName ?? r.manager_name ?? '',
  });

  const isPermanent = (empId) => /^AIPL\d{4,5}$/i.test(String(empId || '').trim());

  // “best guess current id”
  const getCurrentId = (row) => String(row?.employeeId || row?.tempEmployeeId || '').trim();

  const load = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const [sRes, idsRes] = await Promise.all([getPendingSignatures(), getPendingPermanentIds()]);

      setPendingSigs(sRes.data?.data?.assignments || []);

      const raw = idsRes.data?.data?.assignments || [];
      const normalized = raw.map(normalizePendingIdRow);

      // keep frontend filter as extra safety
      const stillPending = normalized.filter((r) => !isPermanent(r.employeeId));
      setPendingIds(stillPending);
    } catch (e) {
      console.error(e);
      setPendingSigs([]);
      setPendingIds([]);
      setMessage({ type: 'error', text: 'Failed to load pending actions.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [authLoading, isAdmin, navigate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prevPageRef.current === null) {
      prevPageRef.current = initial.tab === 'signatures' ? initial.signatures.page : initial.ids.page;
    }
  }, [initial]);

  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      urlInitializedRef.current = true;
      return;
    }

    isSyncingFromUrlRef.current = true;

    const urlTab = searchParams.get('tab') === 'ids' ? 'ids' : 'signatures';
    const urlSearch = searchParams.get('search') || '';
    const urlPage = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const urlPerPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    queueMicrotask(() => {
      setTab((prev) => (prev === urlTab ? prev : urlTab));

      if (urlTab === 'signatures') {
        setSigSearch((prev) => (prev === urlSearch ? prev : urlSearch));
        setSigPage((prev) => (prev === urlPage ? prev : urlPage));
        setSigPerPage((prev) => (prev === urlPerPage ? prev : urlPerPage));
        setSigMissingFilter((prev) => {
          const next = searchParams.get('missing') || DEFAULT_SIG_MISSING;
          return prev === next ? prev : next;
        });
        prevPageRef.current = urlPage;
      } else {
        setIdSearch((prev) => (prev === urlSearch ? prev : urlSearch));
        setIdPage((prev) => (prev === urlPage ? prev : urlPage));
        setIdPerPage((prev) => (prev === urlPerPage ? prev : urlPerPage));
        setIdProcessFilter((prev) => {
          const next = searchParams.get('process') || DEFAULT_ID_PROCESS;
          return prev === next ? prev : next;
        });
        setIdStatusFilter((prev) => {
          const next = searchParams.get('idStatus') || DEFAULT_ID_STATUS;
          return prev === next ? prev : next;
        });
        prevPageRef.current = urlPage;
      }

      isSyncingFromUrlRef.current = false;
    });
  }, [searchParams]);

  useEffect(() => {
    if (isSyncingFromUrlRef.current || !urlInitializedRef.current) return;

    const p = new URLSearchParams();
    p.set('tab', tab);

    const activePage = tab === 'signatures' ? sigPage : idPage;

    if (tab === 'signatures') {
      if (debouncedSigSearch) p.set('search', debouncedSigSearch);
      p.set('page', String(sigPage || 1));
      if (sigPerPage !== DEFAULT_ITEMS_PER_PAGE) p.set('perPage', String(sigPerPage));
      if (sigMissingFilter !== DEFAULT_SIG_MISSING) p.set('missing', sigMissingFilter);
    } else {
      if (debouncedIdSearch) p.set('search', debouncedIdSearch);
      p.set('page', String(idPage || 1));
      if (idPerPage !== DEFAULT_ITEMS_PER_PAGE) p.set('perPage', String(idPerPage));
      if (idProcessFilter !== DEFAULT_ID_PROCESS) p.set('process', idProcessFilter);
      if (idStatusFilter !== DEFAULT_ID_STATUS) p.set('idStatus', idStatusFilter);
    }

    const cur = new URLSearchParams(searchParams);
    if (p.toString() !== cur.toString()) {
      const pageChanged = prevPageRef.current !== activePage;
      const shouldPush = isUserPageChangeRef.current && pageChanged;
      setSearchParams(p, { replace: !shouldPush });

      prevPageRef.current = activePage;
      isUserPageChangeRef.current = false;
    }
  }, [
    tab,
    debouncedSigSearch,
    sigPage,
    sigPerPage,
    sigMissingFilter,
    debouncedIdSearch,
    idPage,
    idPerPage,
    idProcessFilter,
    idStatusFilter,
    setSearchParams,
    searchParams,
  ]);

  useEffect(() => {
    const key = `${debouncedSigSearch}::${sigMissingFilter}`;
    const changed = lastSigKeyRef.current !== key;
    if (didSigFilterOnceRef.current && changed && !isSyncingFromUrlRef.current) {
      isUserPageChangeRef.current = false;
      setSigPage(1);
    }
    didSigFilterOnceRef.current = true;
    lastSigKeyRef.current = key;
  }, [debouncedSigSearch, sigMissingFilter]);

  useEffect(() => {
    const key = `${debouncedIdSearch}::${idProcessFilter}::${idStatusFilter}`;
    const changed = lastIdKeyRef.current !== key;
    if (didIdFilterOnceRef.current && changed && !isSyncingFromUrlRef.current) {
      isUserPageChangeRef.current = false;
      setIdPage(1);
    }
    didIdFilterOnceRef.current = true;
    lastIdKeyRef.current = key;
  }, [debouncedIdSearch, idProcessFilter, idStatusFilter]);

  const openUpdateModal = (row) => {
    const n = normalizePendingIdRow(row);
    setSelected(n);

    // ✅ Prefill with existing ID if present (helps correct invalid IDs quickly)
    const current = getCurrentId(n);
    setNewEmpId(current);

    setShowModal(true);
    setMessage({ type: '', text: '' });
  };

  const closeModal = () => {
    setShowModal(false);
    setSelected(null);
    setNewEmpId('');
    setSaving(false);
  };

  const saveEmployeeId = async () => {
    if (!selected) return;

    const clean = newEmpId.trim().toUpperCase();

    if (!clean) {
      setMessage({ type: 'error', text: 'Employee ID is required.' });
      return;
    }

    if (!/^AIPL\d{4,5}$/.test(clean)) {
      setMessage({
        type: 'error',
        text: 'Permanent Employee ID must be like AIPL1234 (4-5 digits).',
      });
      return;
    }

    if (!selected.userId) {
      setMessage({
        type: 'error',
        text: 'User ID missing for this row. Refresh the page and try again.',
      });
      return;
    }

    try {
      setSaving(true);
      setMessage({ type: '', text: '' });

      await updateEmployeeId(selected.userId, clean);

      closeModal();
      setMessage({ type: 'success', text: 'Employee ID updated successfully.' });
      await load();
    } catch (e) {
      console.error(e);
      setSaving(false);
      setMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Failed to update employee ID.',
      });
    }
  };

  const goCollect = (assignmentId) => {
    if (!assignmentId) {
      setMessage({ type: 'error', text: 'Assignment ID missing. Refresh and try again.' });
      return;
    }
    rememberListFocus(location, assignmentId);
    navigate(`/assignments/${assignmentId}/sign`);
  };

  const missingLabel = (m) => {
    if (!m) return '—';
    const parts = [];
    if (m.agent) parts.push('Agent');
    if (m.admin_exec) parts.push('Admin Exec');
    if (m.it_staff) parts.push('IT Staff');
    if (m.managerOrTl) parts.push('Manager/TL');
    return parts.length ? parts.join(', ') : '—';
  };

  const modalCurrentId = useMemo(() => getCurrentId(selected), [selected]);
  const modalCurrentIdIsPermanent = useMemo(() => isPermanent(modalCurrentId), [modalCurrentId]);

  const signatureRowsFiltered = useMemo(() => {
    const q = debouncedSigSearch.trim().toLowerCase();
    return pendingSigs.filter((a) => {
      if (sigMissingFilter !== DEFAULT_SIG_MISSING && !a?.missing?.[sigMissingFilter]) return false;

      if (!q) return true;
      const hay = [
        a.id,
        a.agentName,
        a.employeeId,
        a.headsetNumber,
        a.tlName,
        a.managerName,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [pendingSigs, debouncedSigSearch, sigMissingFilter]);

  const processOptions = useMemo(() => {
    const values = Array.from(new Set(pendingIds.map((r) => String(r.process || '').trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return [
      { value: DEFAULT_ID_PROCESS, label: 'All Processes' },
      ...values.map((v) => ({ value: v, label: v })),
    ];
  }, [pendingIds]);

  const idRowsFiltered = useMemo(() => {
    const q = debouncedIdSearch.trim().toLowerCase();
    return pendingIds.filter((r) => {
      if (idProcessFilter !== DEFAULT_ID_PROCESS && String(r.process || '').trim() !== idProcessFilter) return false;

      const hasTempId = Boolean(String(r.tempEmployeeId || '').trim());
      if (idStatusFilter === 'hasTempId' && !hasTempId) return false;
      if (idStatusFilter === 'noTempId' && hasTempId) return false;

      if (!q) return true;
      const hay = [
        r.assignmentId,
        r.agentName,
        r.tempEmployeeId,
        r.headsetNumber,
        r.process,
        r.tlName,
        r.managerName,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [pendingIds, debouncedIdSearch, idProcessFilter, idStatusFilter]);

  const sigTotalPages = Math.max(1, Math.ceil(signatureRowsFiltered.length / sigPerPage));
  const idTotalPages = Math.max(1, Math.ceil(idRowsFiltered.length / idPerPage));

  useEffect(() => {
    if (sigPage > sigTotalPages && !isSyncingFromUrlRef.current) setSigPage(sigTotalPages);
  }, [sigPage, sigTotalPages]);

  useEffect(() => {
    if (idPage > idTotalPages && !isSyncingFromUrlRef.current) setIdPage(idTotalPages);
  }, [idPage, idTotalPages]);

  const signatureRowsPage = useMemo(() => {
    const start = (sigPage - 1) * sigPerPage;
    return signatureRowsFiltered.slice(start, start + sigPerPage);
  }, [signatureRowsFiltered, sigPage, sigPerPage]);

  const idRowsPage = useMemo(() => {
    const start = (idPage - 1) * idPerPage;
    return idRowsFiltered.slice(start, start + idPerPage);
  }, [idRowsFiltered, idPage, idPerPage]);

  const exportSignatures = () => {
    if (!signatureRowsFiltered.length) return;
    downloadXlsx(
      signatureRowsFiltered.map((a) => ({
        'Assignment ID': a.id || '—',
        Agent: a.agentName || '—',
        'Emp ID': a.employeeId || '—',
        'Headset #': a.headsetNumber || '—',
        TL: a.tlName || '—',
        Manager: a.managerName || '—',
        'Missing Signs': missingLabel(a.missing),
      })),
      'Pending Signatures',
      `Pending_Signatures_${todayStamp()}.xlsx`,
    );
  };

  const exportIds = () => {
    if (!idRowsFiltered.length) return;
    downloadXlsx(
      idRowsFiltered.map((r) => ({
        'Assignment ID': r.assignmentId || '—',
        Agent: r.agentName || '—',
        'Temp ID': r.tempEmployeeId || '—',
        'Headset #': r.headsetNumber || '—',
        'Headset Type': r.headsetType || '—',
        Process: r.process || '—',
        TL: r.tlName || '—',
        Manager: r.managerName || '—',
      })),
      'Pending Permanent IDs',
      `Pending_Permanent_IDs_${todayStamp()}.xlsx`,
    );
  };

  const clearSigFilters = () => {
    setSigSearch('');
    setSigMissingFilter(DEFAULT_SIG_MISSING);
    setSigPage(DEFAULT_PAGE);
  };

  const clearIdFilters = () => {
    setIdSearch('');
    setIdProcessFilter(DEFAULT_ID_PROCESS);
    setIdStatusFilter(DEFAULT_ID_STATUS);
    setIdPage(DEFAULT_PAGE);
  };

  return (
    <div className="dash-container pa-container">
      <div className="container dash-content pa-content">
        <div className="dash-header-card pa-header-card">
          <div>
            <h1 className="dash-title">
              <i className="bi bi-hourglass-split" aria-hidden="true" />
              Pending Actions
            </h1>
            <p className="dash-subtitle">Collect signatures and update permanent employee IDs</p>
          </div>

          <div className="pa-header-actions">
            <button className="pa-head-btn" onClick={load} type="button">
              <i className="bi bi-arrow-clockwise" aria-hidden="true" />
              Refresh
            </button>
            <button className="pa-head-btn secondary" onClick={() => navigate('/dashboard')} type="button">
              <i className="bi bi-arrow-left" aria-hidden="true" />
              Back to Dashboard
            </button>
          </div>
        </div>

        {message.text && <div className={`pa-alert dash-table-alert ${message.type}`}>{message.text}</div>}

        <div className="pa-tabs-card">
          <div className="pa-tabs">
            <button
              className={`pa-tab ${tab === 'signatures' ? 'active' : ''}`}
              onClick={() => setTab('signatures')}
              type="button"
            >
              Pending Signatures ({pendingSigs.length})
            </button>
            <button className={`pa-tab ${tab === 'ids' ? 'active' : ''}`} onClick={() => setTab('ids')} type="button">
              Pending Permanent IDs ({pendingIds.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="dash-loading">
            <div className="dash-spinner" />
            <p>Loading pending actions...</p>
          </div>
        ) : tab === 'signatures' ? (
          <div className="dash-table-card pa-table-card" ref={sigTableCardRef}>
            <div className="dash-table-top">
              <div className="dash-table-title">
                <h2>Pending Signatures</h2>
                <p>Required: Agent + Admin Executive + IT Staff + (Manager OR TL)</p>
              </div>

              <div className="dash-table-controls">
                <div className="dash-search">
                  <i className="bi bi-search" />
                  <input
                    value={sigSearch}
                    onChange={(e) => setSigSearch(e.target.value)}
                    placeholder="Search assignment, agent, emp ID, headset, TL, manager..."
                  />
                  {sigSearch && (
                    <button className="dash-search-clear" type="button" onClick={() => setSigSearch('')} aria-label="Clear search">
                      <i className="bi bi-x-lg" />
                    </button>
                  )}
                </div>

                <select
                  className="dash-select"
                  value={sigMissingFilter}
                  onChange={(e) => setSigMissingFilter(e.target.value)}
                >
                  <option value="all">All Missing Signatures</option>
                  <option value="agent">Agent</option>
                  <option value="admin_exec">Admin Exec</option>
                  <option value="it_staff">IT Staff</option>
                  <option value="managerOrTl">Manager/TL</option>
                </select>

                <button className="dash-page-btn" type="button" onClick={clearSigFilters}>
                  Clear filters
                </button>

                <button
                  className="dash-export-btn"
                  onClick={exportSignatures}
                  type="button"
                  disabled={!signatureRowsFiltered.length}
                >
                  <i className="bi bi-file-earmark-excel" />
                  Export
                </button>
              </div>
            </div>

            <div className="dash-table-meta">
              <div className="dash-perpage">
                <label>Items per page:</label>
                <select
                  className="dash-select"
                  value={sigPerPage}
                  onChange={(e) => {
                    isUserPageChangeRef.current = false;
                    setSigPerPage(toPositiveInt(e.target.value, DEFAULT_ITEMS_PER_PAGE));
                    setSigPage(1);
                  }}
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>Total: {signatureRowsFiltered.length}</div>
            </div>

            {signatureRowsFiltered.length === 0 ? (
              <div className="dash-empty pa-empty">
                <i className="bi bi-inbox" aria-hidden="true" />
                <p>No matching rows. Try adjusting filters.</p>
              </div>
            ) : (
              <>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Assignment ID</th>
                        <th>Agent</th>
                        <th>Emp ID</th>
                        <th>Headset</th>
                        <th>TL</th>
                        <th>Manager</th>
                        <th>Missing Signs</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signatureRowsPage.map((a) => (
                        <tr
                          key={`ps-${a.id}`}
                          ref={(el) => {
                            if (el) {
                              sigRowRefs.current[String(a.id)] = el;
                            } else {
                              delete sigRowRefs.current[String(a.id)];
                            }
                          }}
                          className={String(a.id) === String(focusedItemId) ? 'dash-row-focused pa-row-focused' : ''}
                        >
                          <td>{a.id || '—'}</td>
                          <td>{a.agentName || '—'}</td>
                          <td>{a.employeeId || '—'}</td>
                          <td>{a.headsetNumber || '—'}</td>
                          <td>{a.tlName || '—'}</td>
                          <td>{a.managerName || '—'}</td>
                          <td>{missingLabel(a.missing)}</td>
                          <td>
                            <button className="dash-page-btn" onClick={() => goCollect(a.id)} type="button">
                              Collect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <SmartPagination
                  currentPage={sigPage}
                  totalPages={sigTotalPages}
                  onPageChange={(targetPage, anchor) => {
                    void anchor;
                    isUserPageChangeRef.current = true;
                    setSigPage(targetPage);
                  }}
                  scrollTargetRef={sigTableCardRef}
                  className="dash-pagination sigPagination"
                />
              </>
            )}
          </div>
        ) : (
          <div className="dash-table-card pa-table-card" ref={idTableCardRef}>
            <div className="dash-table-top">
              <div className="dash-table-title">
                <h2>Pending Permanent IDs</h2>
                <p>Deposit PDF remains locked until permanent ID is updated and signatures are collected.</p>
              </div>

              <div className="dash-table-controls">
                <div className="dash-search">
                  <i className="bi bi-search" />
                  <input
                    value={idSearch}
                    onChange={(e) => setIdSearch(e.target.value)}
                    placeholder="Search assignment, agent, temp ID, headset, process, TL, manager..."
                  />
                  {idSearch && (
                    <button className="dash-search-clear" type="button" onClick={() => setIdSearch('')} aria-label="Clear search">
                      <i className="bi bi-x-lg" />
                    </button>
                  )}
                </div>

                <select className="dash-select" value={idProcessFilter} onChange={(e) => setIdProcessFilter(e.target.value)}>
                  {processOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                <select className="dash-select" value={idStatusFilter} onChange={(e) => setIdStatusFilter(e.target.value)}>
                  <option value="all">All ID Status</option>
                  <option value="hasTempId">Has Temp ID</option>
                  <option value="noTempId">No Temp ID</option>
                </select>

                <button className="dash-page-btn" type="button" onClick={clearIdFilters}>
                  Clear filters
                </button>

                <button className="dash-export-btn" onClick={exportIds} type="button" disabled={!idRowsFiltered.length}>
                  <i className="bi bi-file-earmark-excel" />
                  Export
                </button>
              </div>
            </div>

            <div className="dash-table-meta">
              <div className="dash-perpage">
                <label>Items per page:</label>
                <select
                  className="dash-select"
                  value={idPerPage}
                  onChange={(e) => {
                    isUserPageChangeRef.current = false;
                    setIdPerPage(toPositiveInt(e.target.value, DEFAULT_ITEMS_PER_PAGE));
                    setIdPage(1);
                  }}
                >
                  {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>Total: {idRowsFiltered.length}</div>
            </div>

            {idRowsFiltered.length === 0 ? (
              <div className="dash-empty pa-empty">
                <i className="bi bi-inbox" aria-hidden="true" />
                <p>No matching rows. Try adjusting filters.</p>
              </div>
            ) : (
              <>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Assignment ID</th>
                        <th>Agent</th>
                        <th>Temp ID</th>
                        <th>Headset #</th>
                        <th>Headset Type</th>
                        <th>Process</th>
                        <th>TL</th>
                        <th>Manager</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {idRowsPage.map((r) => (
                        <tr key={`pid-${r.assignmentId}-${r.userId || 'nouser'}`}>
                          <td>{r.assignmentId || '—'}</td>
                          <td>{r.agentName || '—'}</td>
                          <td>{r.tempEmployeeId || '—'}</td>
                          <td>{r.headsetNumber || '—'}</td>
                          <td>{r.headsetType || '—'}</td>
                          <td>{r.process || '—'}</td>
                          <td>{r.tlName || '—'}</td>
                          <td>{r.managerName || '—'}</td>
                          <td>
                            <button className="dash-page-btn" onClick={() => openUpdateModal(r)} type="button">
                              Update ID
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <SmartPagination
                  currentPage={idPage}
                  totalPages={idTotalPages}
                  onPageChange={(targetPage, anchor) => {
                    void anchor;
                    isUserPageChangeRef.current = true;
                    setIdPage(targetPage);
                  }}
                  scrollTargetRef={idTableCardRef}
                  className="dash-pagination idPagination"
                />
              </>
            )}

            {showModal && (
              <div className="pa-modal-backdrop" onClick={closeModal}>
                <div className="pa-modal" onClick={(e) => e.stopPropagation()}>
                  <h3 className="pa-modal-title">
                    <i className="bi bi-pencil-square" aria-hidden="true" />
                    Update Permanent Employee ID
                  </h3>

                  <div className="pa-modal-meta">
                    <div>
                      <b>Agent:</b> {selected?.agentName}
                    </div>
                    <div>
                      <b>Temp ID:</b> {selected?.tempEmployeeId || '—'}
                    </div>
                    <div>
                      <b>Assignment ID:</b> {selected?.assignmentId}
                    </div>
                    <div>
                      <b>Headset:</b> {selected?.headsetNumber} ({selected?.headsetType})
                    </div>
                    <div>
                      <b>Process:</b> {selected?.process || '—'}
                    </div>
                  </div>

                  {modalCurrentId && !modalCurrentIdIsPermanent && (
                    <div className="pa-alert dash-table-alert warn" style={{ marginTop: 10 }}>
                      Current ID "<b>{modalCurrentId}</b>" is not a valid permanent ID. Please correct it to <b>AIPL####</b>{' '}
                      (4–5 digits).
                    </div>
                  )}

                  <label className="pa-modal-label">New Employee ID *</label>
                  <input
                    className="pa-modal-input"
                    value={newEmpId}
                    onChange={(e) => setNewEmpId(e.target.value)}
                    placeholder="e.g. AIPL1234"
                  />

                  <div className="pa-modal-actions">
                    <button className="pa-modal-btn secondary" onClick={closeModal} type="button" disabled={saving}>
                      Cancel
                    </button>
                    <button className="pa-modal-btn" onClick={saveEmployeeId} type="button" disabled={saving}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
