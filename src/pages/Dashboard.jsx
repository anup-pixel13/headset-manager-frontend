import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import { useAuth } from '../auth/AuthContext';
import { getDashboardStats } from '../services/dashboardService';
import { getAllAssignments } from '../services/assignmentService';
import { generateDepositFormPdf } from '../services/pdfService';
import SmartPagination from '../components/SmartPagination';
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

function isOnHold(a) {
  const hs = norm(a?.holdStatus);
  if (!hs || hs === 'none' || hs === 'no_hold' || hs === 'not_on_hold') return false;
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
  const { logout } = useAuth();

  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const urlInitializedRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);
  const didFilterOnceRef = useRef(false);
  const lastKeyRef = useRef('');

  const tableCardRef = useRef(null);

  const initial = useMemo(() => {
    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const search = searchParams.get('search') || '';
    const processId = searchParams.get('processId') || 'all';
    const status = searchParams.get('status') || DEFAULT_STATUS;

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);
    return { startDate, endDate, search, processId, status, page, perPage };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 400);

  const handleLogout = async () => {
    if (isLoggingOut || !window.confirm('Log out of Headset Manager?')) return;

    setIsLoggingOut(true);

    try {
      await logout();
    } catch (err) {
      console.error('Dashboard logout failed:', err);
    } finally {
      setIsLoggingOut(false);
      navigate('/login', { replace: true });
    }
  };

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

    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const search = searchParams.get('search') || '';
    const process = searchParams.get('processId') || 'all';
    const status = searchParams.get('status') || DEFAULT_STATUS;

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    setDateFilter((prev) =>
      prev.startDate === startDate && prev.endDate === endDate ? prev : { startDate, endDate }
    );
    setSearchTerm((prev) => (prev === search ? prev : search));
    setProcessId((prev) => (prev === process ? prev : process));
    const safeStatus = ['active', 'inactive', 'all'].includes(status) ? status : DEFAULT_STATUS;
    setAssignmentStatus((prev) => (prev === safeStatus ? prev : safeStatus));
    setCurrentPage((prev) => (prev === page ? prev : page));
    setItemsPerPage((prev) => (prev === perPage ? prev : perPage));

    prevPageRef.current = page;

    queueMicrotask(() => {
      isSyncingFromUrlRef.current = false;
    });
  }, [searchParams]);

  // state -> URL (debounced search)
  useEffect(() => {
    if (isSyncingFromUrlRef.current || !urlInitializedRef.current) return;

    const p = new URLSearchParams();

    p.set('startDate', dateFilter.startDate || DEFAULT_START);
    p.set('endDate', dateFilter.endDate || DEFAULT_TODAY);

    if (debouncedSearchTerm) p.set('search', debouncedSearchTerm);
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
    debouncedSearchTerm,
    processId,
    assignmentStatus,
    currentPage,
    itemsPerPage,
    setSearchParams,
    searchParams,
  ]);

  useEffect(() => {
    (async () => {
      try {
        setStatsLoading(true);
        const res = await getDashboardStats(dateFilter.startDate, dateFilter.endDate);
        setStats(res.data?.data || null);
      } catch (e) {
        console.error(e);
        setStats(null);
      } finally {
        setStatsLoading(false);
      }
    })();
  }, [dateFilter.startDate, dateFilter.endDate]);

  useEffect(() => {
    const key = `${debouncedSearchTerm}||${processId}||${assignmentStatus}||${dateFilter.startDate}||${dateFilter.endDate}`;
    const keyChanged = lastKeyRef.current !== key;

    if (didFilterOnceRef.current && keyChanged && !isSyncingFromUrlRef.current) {
      isUserPageChangeRef.current = false;
      setCurrentPage(1);
    }

    didFilterOnceRef.current = true;
    lastKeyRef.current = key;
  }, [debouncedSearchTerm, processId, assignmentStatus, dateFilter.startDate, dateFilter.endDate]);

  const fetchAssignments = async () => {
    const res = await getAllAssignments({
      search: debouncedSearchTerm || '',
      is_active: statusToApiIsActive(assignmentStatus),
      start_date: dateFilter.startDate,
      end_date: dateFilter.endDate,
      process_id: processId === 'all' ? '' : processId,
      page: currentPage,
      limit: itemsPerPage,
      sort_by: 'assignment_date',
      sort_order: 'DESC',
    });

    const payload = res.data;
    const rows = payload?.data || [];
    const total = payload?.pagination?.total ?? 0;

    setAssignments(rows);
    setAssignmentsTotal(total);
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
  }, [
    debouncedSearchTerm,
    processId,
    assignmentStatus,
    dateFilter.startDate,
    dateFilter.endDate,
    currentPage,
    itemsPerPage,
  ]);

  const processOptions = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      if (a?.process?.id && a?.process?.name) map.set(String(a.process.id), a.process.name);
    }
    const arr = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    arr.sort((x, y) => x.name.localeCompare(y.name));
    return [{ id: 'all', name: 'All Processes' }, ...arr];
  }, [assignments]);

  const totalPages = Math.max(1, Math.ceil(assignmentsTotal / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages && !isSyncingFromUrlRef.current) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

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
    const refundStatus = a?.deposit?.refundStatus ?? '';

    return {
      'Assignment ID': a.id,
      'Assignment Date': a.assignmentDate ? new Date(a.assignmentDate).toLocaleString() : '',
      State: state,
      'Hold Status': a.holdStatus || '',
      'Hold Reason': a.holdReason || '',
      'Hold Started At': a.holdStartedAt ? new Date(a.holdStartedAt).toLocaleString() : '',
      'Hold Ended At': a.holdEndedAt ? new Date(a.holdEndedAt).toLocaleString() : '',
      'Assignment Kind': a.assignmentKind || '',
      'Parent Assignment ID': a.parentAssignmentId || '',

      'Agent Name': a.agent?.name || '',
      'Employee ID': a.agent?.employeeId || '',

      'Headset Number (Current)': a.headset?.number || '',
      'Headset Type (Current)': formatHeadsetType(a.headset?.type),

      'Headset Number (Original)': a.originalHeadset?.number || '',
      'Headset Type (Original)': a.originalHeadset?.type ? formatHeadsetType(a.originalHeadset?.type) : '',

      Process: a.process?.name || '',

      'Tier Deposit Amount': formatMoney(tierDep),
      'Tier Refund Amount': formatMoney(tierRef),
      'Paid Deposit Amount': formatMoney(paidDep),
      'Refund Status': refundStatus,

      Signatures: a.isCompleteForPdf ? 'Complete' : 'Pending',
      'Permanent ID': a.hasPermanentEmployeeId ? 'Yes' : 'No',
      'PDF Generated': a.depositPdf?.viewUrl ? 'Yes' : 'No',

      'Assignment Active?': a.isActive ? 'Yes' : 'No',
      'Assignment Verified?': a.isVerified ? 'Yes' : 'No',

      Remark: a.systemRemark || '',
    };
  };

  const exportCurrentPage = () => {
    const excelData = assignments.map(buildExportRow);
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Page_${currentPage}`);
    XLSX.writeFile(wb, `Assignments_Page_${currentPage}_${dateFilter.startDate}_to_${dateFilter.endDate}.xlsx`);
  };

  const exportAllFiltered = async () => {
    try {
      const MAX_LIMIT = 100;
      let page = 1;
      let collected = [];

      while (true) {
        const res = await getAllAssignments({
          search: debouncedSearchTerm || '',
          is_active: statusToApiIsActive(assignmentStatus),
          start_date: dateFilter.startDate,
          end_date: dateFilter.endDate,
          process_id: processId === 'all' ? '' : processId,
          page,
          limit: MAX_LIMIT,
          sort_by: 'assignment_date',
          sort_order: 'DESC',
        });

        const payload = res.data;
        const rows = payload?.data || [];
        collected = collected.concat(rows);

        const total = payload?.pagination?.total ?? collected.length;
        if (collected.length >= total) break;

        page += 1;
        if (page > 200) break;
      }

      const excelData = collected.map(buildExportRow);

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Assignments');

      const procLabel = processId === 'all' ? 'All_Processes' : `Process_${processId}`;
      const statusLabel = assignmentStatus;
      XLSX.writeFile(wb, `Assignments_${statusLabel}_${procLabel}_${dateFilter.startDate}_to_${dateFilter.endDate}.xlsx`);
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
      setTableMsg({ type: '', text: '' });
      setAssignments((prev) => prev.map((x) => (x.id === assignmentId ? { ...x, _pdfGenerating: true } : x)));

      const res = await generateDepositFormPdf(assignmentId);

      const viewUrl = res.data?.data?.viewUrl || null;
      const downloadUrl = res.data?.data?.downloadUrl || null;
      const fileName = res.data?.data?.fileName || null;
      const filePath = res.data?.data?.filePath || null;

      const depositPdf =
        viewUrl || downloadUrl || filePath
          ? {
              viewUrl: viewUrl || filePath,
              downloadUrl: downloadUrl || (filePath ? `${filePath}?download=1` : null),
              fileName,
              filePath,
              generatedAt: res.data?.data?.generatedAt || null,
              documentType: res.data?.data?.documentType || null,
            }
          : null;

      setAssignments((prev) =>
        prev.map((x) =>
          x.id === assignmentId ? { ...x, depositPdf: depositPdf || x.depositPdf, _pdfGenerating: false } : x
        )
      );

      if (depositPdf?.viewUrl) openUrl(depositPdf.viewUrl);

      setTableMsg({ type: 'success', text: `PDF generated for Assignment #${assignmentId}.` });
    } catch (e) {
      console.error(e);
      setAssignments((prev) => prev.map((x) => (x.id === assignmentId ? { ...x, _pdfGenerating: false } : x)));
      setTableMsg({
        type: 'error',
        text: e?.response?.data?.message || 'Failed to generate deposit PDF.',
      });
    }
  };

  const tiles = [
    {
      label: 'In Stock',
      value: stats?.inventory?.available ?? 0,
      className: 'dash-tile stock',
      onClick: () => navigate('/inventory?status=available'),
    },
    {
      label: 'Assigned',
      value: stats?.inventory?.assigned ?? 0,
      className: 'dash-tile assigned',
      onClick: () => navigate('/inventory?status=assigned'),
    },
    {
      label: 'In Repair',
      value: stats?.inventory?.inRepair ?? 0,
      className: 'dash-tile repair',
      onClick: () => navigate('/repairs'),
    },
    {
      label: 'Pending Employee IDs',
      value: stats?.alerts?.pendingEmployeeIds ?? 0,
      className: 'dash-tile ids',
      onClick: () => navigate('/pending?tab=ids'),
    },
    {
      label: 'Pending Signatures',
      value: stats?.alerts?.pendingSignatures ?? 0,
      className: 'dash-tile verify',
      onClick: () => navigate('/pending?tab=signatures'),
    },
  ];

  return (
    <div className="dash-container">
      <div className="container dash-content">
        <div className="dash-header-card">
          <div className="dash-header-left">
            <h1 className="dash-title">
              <i className="bi bi-speedometer2" />
              Dashboard
            </h1>
            <p className="dash-subtitle">Inventory + active assignments (date filtered)</p>
          </div>

          <div className="dash-date-range">
            <input
              type="date"
              value={dateFilter.startDate}
              onChange={(e) => setDateFilter((p) => ({ ...p, startDate: e.target.value }))}
              className="dash-date-input"
            />
            <span className="dash-date-sep">to</span>
            <input
              type="date"
              value={dateFilter.endDate}
              onChange={(e) => setDateFilter((p) => ({ ...p, endDate: e.target.value }))}
              className="dash-date-input"
            />
            <button
              className="dash-reset-btn"
              type="button"
              onClick={() => setDateFilter({ startDate: DEFAULT_START, endDate: DEFAULT_TODAY })}
            >
              <i className="bi bi-arrow-counterclockwise" />
              Reset
            </button>
          </div>
        </div>

        {/* Tiles: render placeholder zeros while stats load (so layout doesn't jump) */}
        <div className="dash-tiles">
          {tiles.map((t) => (
            <button key={t.label} className={t.className} onClick={t.onClick} type="button">
              <span className="dash-tile-value">{statsLoading ? '…' : t.value}</span>
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

          <button className="dash-action-btn" onClick={() => navigate('/agents')} type="button">
            <i className="bi bi-people" /> View All Agents
          </button>

          <button className="dash-action-btn" onClick={() => navigate('/process-change')} type="button">
            <i className="bi bi-shuffle" /> Process Change
          </button>
          <button className="dash-action-btn" onClick={() => navigate('/repairs')} type="button">
            <i className="bi bi-tools" /> Send for Repair
          </button>
          <button className="dash-action-btn" onClick={() => navigate('/refunds')} type="button">
            <i className="bi bi-arrow-repeat" /> Refunds
          </button>
          <button
            className="dash-action-btn danger"
            onClick={handleLogout}
            type="button"
            disabled={isLoggingOut}
          >
            <i className={`bi ${isLoggingOut ? 'bi-arrow-repeat spin' : 'bi-box-arrow-right'}`} />
            {isLoggingOut ? 'Logging out…' : 'Logout'}
          </button>
        </div>

        {/* Table card is ALWAYS mounted so the search/filter inputs never unmount,
            which prevents focus loss + scroll jumps while typing/filtering. */}
        <div className="dash-table-card" ref={tableCardRef}>
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
                {searchTerm && (
                  <button
                    type="button"
                    className="dash-search-clear"
                    onClick={() => setSearchTerm('')}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <i className="bi bi-x-lg" />
                  </button>
                )}
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

              <button
                className="dash-export-btn"
                style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}
                type="button"
                onClick={exportCurrentPage}
                disabled={assignments.length === 0}
                title={`Export ${assignments.length} rows from this page`}
              >
                <i className="bi bi-file-earmark" /> Export Page
              </button>
            </div>

            <div className="dash-counts">
              Total: <strong>{assignmentsTotal}</strong> | Page <strong>{currentPage}</strong> /{' '}
              <strong>{totalPages}</strong>
            </div>
          </div>

          {tableMsg.text && <div className={`dash-table-alert ${tableMsg.type}`}>{tableMsg.text}</div>}

          {tableLoading ? (
            <div className="dash-loading" style={{ padding: 40 }}>
              <div className="dash-spinner" />
              <p>Loading assignments...</p>
            </div>
          ) : (
            <>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Date</th>
                      <th>Agent</th>
                      <th>Emp ID</th>

                      <th>Kind</th>
                      <th>Headset (Current)</th>
                      <th>Original Headset</th>

                      <th>Type</th>
                      <th>Process</th>
                      <th>State</th>

                      <th>Verified</th>
                      <th>Tier Dep</th>
                      <th>Tier Ref</th>
                      <th>Paid Dep</th>

                      <th>Remark</th>
                      <th>PDF Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {assignments.map((a) => {
                      const hold = isOnHold(a);
                      const inactive = a?.isActive === false;
                      const rowClass = `${inactive ? 'dash-row-inactive' : ''} ${hold ? 'dash-row-hold' : ''}`.trim();
                      const viewDisabled = !a.depositPdf?.viewUrl;
                      const downloadDisabled = !a.depositPdf?.downloadUrl;
                      const generateDisabled = !a.canGenerateDepositPdf || !!a.depositPdf?.viewUrl || !!a._pdfGenerating;
                      const generateTitle = a.depositPdf?.viewUrl
                        ? 'PDF already generated'
                        : !a.canGenerateDepositPdf
                          ? !a.hasPermanentEmployeeId
                            ? 'Update permanent employee ID first (AIPL...)'
                            : 'Collect signatures first'
                          : 'Generate PDF';

                      return (
                        <tr key={a.id} className={rowClass}>
                          <td>#{a.id}</td>
                          <td>{a.assignmentDate ? new Date(a.assignmentDate).toLocaleString() : 'N/A'}</td>
                          <td>{a.agent?.name || 'N/A'}</td>
                          <td>{a.agent?.employeeId || 'N/A'}</td>

                          <td style={{ fontWeight: 900 }}>
                            {a.assignmentKind === 'temp_replacement' ? 'Temp' : 'Permanent'}
                          </td>

                          <td>{a.headset?.number || 'N/A'}</td>

                          <td>
                            {a.originalHeadset?.number ? (
                              <span title={`Original headset type: ${a.originalHeadset?.type || ''}`}>
                                {a.originalHeadset.number}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>

                          <td>{formatHeadsetType(a.headset?.type)}</td>
                          <td>{a.process?.name || 'N/A'}</td>

                          <td>
                            {inactive ? (
                              <span className="dash-pill bad">Inactive</span>
                            ) : hold ? (
                              <span className="dash-pill warn">On Hold</span>
                            ) : (
                              <span className="dash-pill ok">Active</span>
                            )}
                          </td>

                          <td>{a.isVerified ? 'Yes' : 'No'}</td>
                          <td>{a?.tier?.depositAmount != null ? formatMoney(a.tier.depositAmount) : '—'}</td>
                          <td>{a?.tier?.refundAmount != null ? formatMoney(a.tier.refundAmount) : '—'}</td>
                          <td>{a?.deposit?.amount != null ? formatMoney(a.deposit.amount) : '—'}</td>

                          <td style={{ maxWidth: 320 }}>
                            <span title={a.systemRemark || ''}>{a.systemRemark || '—'}</span>
                          </td>
                          <td>
                            <div className="dash-pdf-actions">
                              <button
                                type="button"
                                className="dash-row-btn pdf-generate"
                                disabled={generateDisabled}
                                title={generateTitle}
                                onClick={() => handleGeneratePdf(a.id)}
                              >
                                {a._pdfGenerating ? 'Generating...' : 'Generate'}
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
                    })}

                    {assignments.length === 0 && (
                      <tr>
                        <td colSpan={16} style={{ textAlign: 'center', padding: 20 }}>
                          No assignments found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <SmartPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={(targetPage, anchor) => {
                    void anchor;
                    isUserPageChangeRef.current = true;
                    setCurrentPage(targetPage);
                  }}
                  scrollTargetRef={tableCardRef}
                  className="dash-pagination"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
