import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import { getDashboardStats } from '../services/dashboardService';
import { getAllAssignments } from '../services/assignmentService';
import { generateDepositFormPdf } from '../services/pdfService';
import { formatHeadsetType } from '../utils/headsetFormat';

import './Dashboard.css';

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 9;
const ITEMS_PER_PAGE_OPTIONS = [6, 9, 12, 15, 30, 60, 90];

function toPositiveInt(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DEFAULT_TODAY = toIso(new Date());
const fiveYearsAgo = new Date();
fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
const DEFAULT_START = toIso(fiveYearsAgo);

const DEFAULT_STATUS = 'active'; // active | inactive | all

function statusToApiIsActive(status) {
  if (status === 'active') return 'true';
  if (status === 'inactive') return 'false';
  return ''; // all
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

const norm = (v) => String(v || '').trim().toLowerCase();

// ✅ FIXED: only treat actual "on_hold" values as hold
function isOnHold(a) {
  const hs = norm(a?.holdStatus);

  // not on hold
  if (!hs || hs === 'none' || hs === 'no_hold' || hs === 'not_on_hold') return false;

  // on hold
  return hs === 'on_hold' || hs === 'onhold' || hs === 'hold';
}

function formatMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ============================================
  // REFS FOR URL SYNC (smooth typing / no jank)
  // ============================================
  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const urlInitializedRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);
  const didFilterOnceRef = useRef(false);
  const lastKeyRef = useRef('');

  // ============================================
  // GET INITIAL STATE FROM URL
  // ============================================
  const initial = useMemo(() => {
    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const search = searchParams.get('search') || '';
    const processId = searchParams.get('processId') || 'all';
    const status = searchParams.get('status') || DEFAULT_STATUS;

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);
    return { startDate, endDate, search, processId, status, page, perPage };
  }, [searchParams]);

  // ============================================
  // STATE
  // ============================================
  const [statsLoading, setStatsLoading] = useState(true);
  const [tableMsg, setTableMsg] = useState({ type: '', text: '' });
  const [stats, setStats] = useState(null);

  const [tableLoading, setTableLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [assignmentsTotal, setAssignmentsTotal] = useState(0);

  const [dateFilter, setDateFilter] = useState({ startDate: initial.startDate, endDate: initial.endDate });
  const [searchTerm, setSearchTerm] = useState(initial.search);
  const [processId, setProcessId] = useState(initial.processId);
  const [assignmentStatus, setAssignmentStatus] = useState(
    ['active', 'inactive', 'all'].includes(initial.status) ? initial.status : DEFAULT_STATUS
  );

  const [currentPage, setCurrentPage] = useState(initial.page);
  const [itemsPerPage, setItemsPerPage] = useState(initial.perPage);

  // ✅ debounce search so API doesn't fire on every keystroke
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // track initial prev page for URL replace/push behavior
  useEffect(() => {
    if (prevPageRef.current === null) prevPageRef.current = initial.page;
  }, [initial.page]);

  // ============================================
  // URL -> state
  // ============================================
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      urlInitializedRef.current = true;
      return;
    }

    isSyncingFromUrlRef.current = true;

    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const search = searchParams.get('search') || '';
    const process = searchParams.get('processId') || 'all';
    const status = searchParams.get('status') || DEFAULT_STATUS;

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    setDateFilter({ startDate, endDate });
    setSearchTerm(search);
    setProcessId(process);
    setAssignmentStatus(['active', 'inactive', 'all'].includes(status) ? status : DEFAULT_STATUS);
    setCurrentPage(page);
    setItemsPerPage(perPage);

    prevPageRef.current = page;

    queueMicrotask(() => {
      isSyncingFromUrlRef.current = false;
    });
  }, [searchParams]);

  // ============================================
  // state -> URL
  // ============================================
  useEffect(() => {
    if (isSyncingFromUrlRef.current || !urlInitializedRef.current) return;

    const p = new URLSearchParams();

    p.set('startDate', dateFilter.startDate || DEFAULT_START);
    p.set('endDate', dateFilter.endDate || DEFAULT_TODAY);

    if (searchTerm) p.set('search', searchTerm);
    if (processId !== 'all') p.set('processId', String(processId));
    if (assignmentStatus !== DEFAULT_STATUS) p.set('status', assignmentStatus);

    p.set('page', String(currentPage || 1));
    if (itemsPerPage !== DEFAULT_ITEMS_PER_PAGE) p.set('perPage', String(itemsPerPage));

    const currentParams = new URLSearchParams(searchParams);
    if (p.toString() !== currentParams.toString()) {
      const pageChanged = prevPageRef.current !== currentPage;
      const shouldPush = isUserPageChangeRef.current && pageChanged;
      setSearchParams(p, { replace: !shouldPush });

      prevPageRef.current = currentPage;
      isUserPageChangeRef.current = false;
    }
  }, [
    dateFilter.startDate,
    dateFilter.endDate,
    searchTerm,
    processId,
    assignmentStatus,
    currentPage,
    itemsPerPage,
    setSearchParams,
    searchParams,
  ]);

  // ============================================
  // stats (date range)
  // ============================================
  useEffect(() => {
    (async () => {
      try {
        setStatsLoading(true);
        const res = await getDashboardStats(dateFilter.startDate, dateFilter.endDate);
        setStats(res.data?.data || null);
      } catch (e) {
        console.error(e);
        alert('Failed to load dashboard stats');
        setStats(null);
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [dateFilter.startDate, dateFilter.endDate]);

  // ============================================
  // Reset page to 1 when filters change (not URL sync)
  // ============================================
  useEffect(() => {
    const key = `${searchTerm}||${processId}||${assignmentStatus}||${dateFilter.startDate}||${dateFilter.endDate}`;
    const keyChanged = lastKeyRef.current !== key;

    if (didFilterOnceRef.current && keyChanged && !isSyncingFromUrlRef.current) {
      isUserPageChangeRef.current = false;
      setCurrentPage(1);
    }

    didFilterOnceRef.current = true;
    lastKeyRef.current = key;
  }, [searchTerm, processId, assignmentStatus, dateFilter.startDate, dateFilter.endDate]);

  // ============================================
  // Fetch assignments (server paginated)
  // ============================================
  const fetchAssignments = async () => {
    const res = await getAllAssignments({
      search: debouncedSearchTerm || '',
      is_active: statusToApiIsActive(assignmentStatus),
      start_date: dateFilter.startDate,
      end_date: dateFilter.endDate,
      page: currentPage,
      limit: itemsPerPage,
      process_id: processId === 'all' ? '' : processId,
    });

    const payload = res.data;
    setAssignments(payload?.data || []);
    setAssignmentsTotal(payload?.pagination?.total ?? 0);
  };

  useEffect(() => {
    (async () => {
      try {
        setTableLoading(true);
        setTableMsg({ type: '', text: '' });
        await fetchAssignments();
      } catch (e) {
        console.error(e);
        setAssignments([]);
        setAssignmentsTotal(0);
        setTableMsg({ type: 'error', text: e?.response?.data?.message || 'Failed to load assignments.' });
      } finally {
        setTableLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, assignmentStatus, processId, dateFilter.startDate, dateFilter.endDate, currentPage, itemsPerPage]);

  const processOptions = useMemo(() => {
    const set = new Map();
    assignments.forEach((a) => {
      if (a?.processId && a?.processName) set.set(String(a.processId), a.processName);
    });
    const arr = Array.from(set.entries()).map(([id, name]) => ({ id, name }));
    arr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return [{ id: 'all', name: 'All Processes' }, ...arr];
  }, [assignments]);

  const totalPages = Math.max(1, Math.ceil(assignmentsTotal / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages && !isSyncingFromUrlRef.current) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // ============================================
  // Export
  // ============================================
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    processId !== 'all' ||
    assignmentStatus !== DEFAULT_STATUS ||
    dateFilter.startDate !== DEFAULT_START ||
    dateFilter.endDate !== DEFAULT_TODAY;

  const buildExportRow = (a) => {
    const hold = isOnHold(a);
    const state = a?.isActive === false ? 'inactive' : hold ? 'on_hold' : 'active';

    const tierDep = a?.tier?.depositAmount ?? '';
    const tierRef = a?.tier?.refundAmount ?? '';
    const paidDep = a?.deposit?.amount ?? '';

    const name = a?.agentName ?? '';
    const emp = a?.employeeId ?? '';
    const headset = a?.headsetNumber ?? '';
    const type = a?.headsetType ?? '';
    const proc = a?.processName ?? '';

    const assignedAt = a?.assignmentDate ? new Date(a.assignmentDate).toLocaleString() : '';
    const verified = a?.isVerified ? 'Yes' : 'No';

    const holdStatus = a?.holdStatus ?? '';

    return {
      'Agent Name': name,
      'Employee ID': emp,
      'Headset No': headset,
      'Headset Type': type,
      Process: proc,
      'Assigned At': assignedAt,
      Verified: verified,
      Status: state,
      'Hold Status': holdStatus,
      'Tier Deposit': tierDep,
      'Tier Refund': tierRef,
      'Paid Deposit': paidDep,
    };
  };

  const exportAllFiltered = async () => {
    try {
      const MAX_LIMIT = 100;
      let p = 1;
      let collected = [];

      while (true) {
        const res = await getAllAssignments({
          search: debouncedSearchTerm || '',
          is_active: statusToApiIsActive(assignmentStatus),
          start_date: dateFilter.startDate,
          end_date: dateFilter.endDate,
          page: p,
          limit: MAX_LIMIT,
          process_id: processId === 'all' ? '' : processId,
        });

        const payload = res.data;
        const chunk = payload?.data || [];
        collected = collected.concat(chunk);

        const t = payload?.pagination?.total ?? collected.length;
        if (collected.length >= t) break;

        p += 1;
        if (p > 200) break;
      }

      const excelData = collected.map((a) => buildExportRow(a));
      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Assignments');
      XLSX.writeFile(wb, `Assignments_${hasActiveFilters ? 'Filtered' : 'All'}.xlsx`);
    } catch (e) {
      console.error(e);
      alert('Export failed');
    }
  };

  const openUrl = (url) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleGeneratePdf = async (assignmentId) => {
    try {
      await generateDepositFormPdf(assignmentId);
      alert('PDF generated successfully');
      await fetchAssignments();
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || 'PDF generation failed');
    }
  };

  // tiles
  const tiles = useMemo(() => {
    const v = stats || {};

    return [
      {
        label: 'Available',
        value: v.available ?? 0,
        className: 'dash-tile available',
        onClick: () => navigate('/inventory?status=available'),
      },
      {
        label: 'Assigned',
        value: v.assigned ?? 0,
        className: 'dash-tile assigned',
        onClick: () => navigate('/inventory?status=assigned'),
      },
      {
        label: 'Repair',
        value: v.repair ?? 0,
        className: 'dash-tile repair',
        onClick: () => navigate('/inventory?status=repair'),
      },
      {
        label: 'Lost',
        value: v.lost ?? 0,
        className: 'dash-tile lost',
        onClick: () => navigate('/inventory?status=lost'),
      },
      {
        label: 'Pending IDs',
        value: v.pendingIds ?? 0,
        className: 'dash-tile pending',
        onClick: () => navigate('/pending?tab=ids'),
      },
      {
        label: 'Pending Signatures',
        value: v.pendingSignatures ?? 0,
        className: 'dash-tile pending',
        onClick: () => navigate('/pending?tab=signatures'),
      },
      {
        label: 'On Hold',
        value: v.onHold ?? 0,
        className: 'dash-tile onhold',
        onClick: () => navigate('/hold'),
      },
    ];
  }, [navigate, stats]);

  return (
    <div className="dash-container">
      <div className="container dash-content">
        <div className="dash-header-card">
          <div className="dash-header-left">
            <h1 className="dash-title">Headset Manager</h1>
            <p className="dash-subtitle">Dashboard</p>
          </div>

          <div className="dash-date-range">
            <label>
              Start:
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter((p) => ({ ...p, startDate: e.target.value }))}
              />
            </label>
            <label>
              End:
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter((p) => ({ ...p, endDate: e.target.value }))}
              />
            </label>
          </div>
        </div>

        {statsLoading ? (
          <div className="dash-loading">
            <div className="dash-spinner" />
            <p>Loading dashboard stats...</p>
          </div>
        ) : !stats ? (
          <div className="dash-empty">
            <i className="bi bi-inbox" />
            <h3>No data</h3>
            <p>Could not load dashboard stats.</p>
          </div>
        ) : (
          <>
            <div className="dash-tiles">
              {tiles.map((t) => (
                <button key={t.label} className={t.className} onClick={t.onClick} type="button">
                  <span className="dash-tile-value">{t.value}</span>
                  <span className="dash-tile-label">{t.label}</span>
                </button>
              ))}
            </div>

            <div className="dash-actions-card">
              <button className="dash-action-btn" onClick={() => navigate('/inventory')} type="button">
                <i className="bi bi-headset" /> Inventory
              </button>
              <button className="dash-action-btn" onClick={() => navigate('/assign-headset')} type="button">
                <i className="bi bi-person-plus" /> Assign Form
              </button>

              <button className="dash-action-btn" onClick={() => navigate('/create-agent')} type="button">
                <i className="bi bi-person-badge" /> Create Agent
              </button>
              <button className="dash-action-btn" onClick={() => navigate('/yjacks')} type="button">
                <i className="bi bi-usb-plug" /> Y-Jacks
              </button>

              <button className="dash-action-btn" onClick={() => navigate('/transfers')} type="button">
                <i className="bi bi-arrow-left-right" /> Transfers
              </button>
              <button className="dash-action-btn" onClick={() => navigate('/process-change')} type="button">
                <i className="bi bi-shuffle" /> Process Change
              </button>
              <button className="dash-action-btn" onClick={() => navigate('/repairs')} type="button">
                <i className="bi bi-tools" /> Send for Repair
              </button>
              <button className="dash-action-btn" onClick={() => navigate('/deposits')} type="button">
                <i className="bi bi-cash-stack" /> Deposits
              </button>
              <button className="dash-action-btn" onClick={() => navigate('/refunds')} type="button">
                <i className="bi bi-arrow-repeat" /> Refunds
              </button>
              <button className="dash-action-btn" onClick={() => navigate('/pdf-documents')} type="button">
                <i className="bi bi-file-earmark-pdf" /> All PDFs
              </button>
            </div>

            <div className="dash-table-card">
              <div className="dash-table-top">
                <div className="dash-table-title">
                  <h2>Assignments (Date Range)</h2>
                  <p>Search + filters + pagination + export</p>
                </div>

                <div className="dash-table-controls">
                  <div className="dash-search">
                    <i className="bi bi-search" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search name / headset / employee id..."
                    />
                  </div>

                  <select
                    className="dash-select"
                    value={assignmentStatus}
                    onChange={(e) => setAssignmentStatus(e.target.value)}
                    title="Assignment status"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="all">All</option>
                  </select>

                  <select
                    className="dash-select"
                    value={processId}
                    onChange={(e) => setProcessId(e.target.value)}
                    title="Process filter"
                  >
                    {processOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    className="dash-export-btn"
                    type="button"
                    onClick={exportAllFiltered}
                    disabled={assignmentsTotal === 0}
                    title={
                      hasActiveFilters
                        ? `Export ${assignmentsTotal} filtered assignments`
                        : `Export all ${assignmentsTotal} assignments`
                    }
                  >
                    <i className="bi bi-download" /> {hasActiveFilters ? 'Export Filtered' : 'Export All'} (
                    {assignmentsTotal})
                  </button>
                </div>
              </div>

              <div className="dash-table-meta">
                <div className="dash-perpage">
                  <label>Items per page:</label>
                  <select
                    className="dash-select"
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(toPositiveInt(e.target.value, DEFAULT_ITEMS_PER_PAGE))}
                  >
                    {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="dash-pagination">
                  <button
                    className="dash-reset-btn"
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => {
                      isUserPageChangeRef.current = true;
                      setCurrentPage((p) => Math.max(1, p - 1));
                    }}
                  >
                    Prev
                  </button>

                  <span>
                    Page <b>{currentPage}</b> / <b>{totalPages}</b>
                  </span>

                  <button
                    className="dash-reset-btn"
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => {
                      isUserPageChangeRef.current = true;
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                    }}
                  >
                    Next
                  </button>
                </div>

                {tableMsg.text && <div className={`dash-table-alert ${tableMsg.type}`}>{tableMsg.text}</div>}
              </div>

              {/* table */}
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Employee ID</th>
                      <th>Process</th>
                      <th>Headset</th>
                      <th>Type</th>
                      <th>Assigned</th>
                      <th>Verified</th>
                      <th>Status</th>
                      <th>Tier Dep</th>
                      <th>Tier Ref</th>
                      <th>Paid Dep</th>
                      <th>PDF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableLoading ? (
                      <tr>
                        <td colSpan={12} style={{ textAlign: 'center', padding: 16 }}>
                          Loading...
                        </td>
                      </tr>
                    ) : (
                      assignments.map((a) => {
                        const hold = isOnHold(a);
                        const state = a?.isActive === false ? 'inactive' : hold ? 'on_hold' : 'active';

                        // point #1: row highlighting using existing Dashboard.css classes
                        const rowClass =
                          state === 'inactive'
                            ? 'dash-row-inactive'
                            : state === 'on_hold'
                              ? 'dash-row-hold'
                              : '';

                        // point #2: PDF controls + disable Generate if PDF exists
                        const isGenerating = !!a?.depositPdf?.isGenerating;
                        const pdfExists = !!a?.depositPdf?.viewUrl || !!a?.depositPdf?.downloadUrl;

                        const generateDisabled = isGenerating || pdfExists;
                        const generateTitle = isGenerating
                          ? 'Generating...'
                          : pdfExists
                            ? 'PDF already generated'
                            : 'Generate PDF';

                        const viewDisabled = !a?.depositPdf?.viewUrl;
                        const downloadDisabled = !a?.depositPdf?.downloadUrl;

                        return (
                          <tr key={a.id} className={rowClass}>
                            <td>{a.agentName}</td>
                            <td>{a.employeeId}</td>
                            <td>{a.processName}</td>
                            <td>{a.headsetNumber}</td>
                            <td>{formatHeadsetType(a.headsetType)}</td>
                            <td>{a.assignmentDate ? new Date(a.assignmentDate).toLocaleString() : '—'}</td>
                            <td>{a.isVerified ? 'Yes' : 'No'}</td>
                            <td>
                              {state === 'on_hold' ? 'On Hold' : a.isActive === false ? 'Inactive' : 'Active'}
                              {hold && a?.holdStatus ? ` (${a.holdStatus})` : ''}
                            </td>
                            <td>{a?.tier?.depositAmount ?? '—'}</td>
                            <td>{a?.tier?.refundAmount ?? '—'}</td>
                            <td>{a?.deposit?.amount ?? '—'}</td>
                            <td>
                              <div className="dash-row-btns">
                                <button
                                  type="button"
                                  className="dash-row-btn pdf-generate"
                                  disabled={generateDisabled}
                                  title={generateTitle}
                                  onClick={() => handleGeneratePdf(a.id)}
                                >
                                  {isGenerating ? 'Generating...' : 'Generate'}
                                </button>

                                <button
                                  type="button"
                                  className="dash-row-btn pdf-view"
                                  disabled={viewDisabled}
                                  title={viewDisabled ? 'Generate PDF first' : 'View PDF'}
                                  onClick={() => openUrl(a.depositPdf?.viewUrl)}
                                >
                                  View
                                </button>

                                <button
                                  type="button"
                                  className="dash-row-btn pdf-download"
                                  disabled={downloadDisabled}
                                  title={downloadDisabled ? 'Generate PDF first' : 'Download PDF'}
                                  onClick={() => openUrl(a.depositPdf?.downloadUrl)}
                                >
                                  Download
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}

                    {!tableLoading && assignments.length === 0 && (
                      <tr>
                        <td colSpan={12} style={{ textAlign: 'center', padding: 16 }}>
                          No assignments found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
