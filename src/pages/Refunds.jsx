import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import { formatHeadsetType } from '../utils/headsetFormat';
import { getAllRefundRequests, processRefundRequest, markRefundNotEligible, reopenRefundRequest } from '../services/refundService';

import './Refunds.css';

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
const oneYearAgo = new Date();
oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
const DEFAULT_START = toIso(oneYearAgo);

const TAB_OPTIONS = [
  { key: 'in_progress', label: 'In Progress' },
  { key: 'processed', label: 'Processed' },
  { key: 'not_eligible', label: 'Not Eligible' },
];

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export default function Refunds() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL sync refs (same approach as Dashboard)
  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const urlInitializedRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);
  const didFilterOnceRef = useRef(false);
  const lastKeyRef = useRef('');

  // initial from URL
  const initial = useMemo(() => {
    const tab = searchParams.get('tab') || 'in_progress';
    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const search = searchParams.get('search') || '';

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    return {
      tab: TAB_OPTIONS.some((t) => t.key === tab) ? tab : 'in_progress',
      startDate,
      endDate,
      search,
      page,
      perPage,
    };
  }, [searchParams]);

  // state
  const [tab, setTab] = useState(initial.tab);
  const [dateFilter, setDateFilter] = useState({ startDate: initial.startDate, endDate: initial.endDate });
  const [searchTerm, setSearchTerm] = useState(initial.search);

  const [currentPage, setCurrentPage] = useState(initial.page);
  const [itemsPerPage, setItemsPerPage] = useState(initial.perPage);

  const [loading, setLoading] = useState(true);
  const [tableMsg, setTableMsg] = useState({ type: '', text: '' });

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

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

    const tabUrl = searchParams.get('tab') || 'in_progress';
    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;
    const search = searchParams.get('search') || '';

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    setTab(TAB_OPTIONS.some((t) => t.key === tabUrl) ? tabUrl : 'in_progress');
    setDateFilter({ startDate, endDate });
    setSearchTerm(search);
    setCurrentPage(page);
    setItemsPerPage(perPage);

    prevPageRef.current = page;

    queueMicrotask(() => {
      isSyncingFromUrlRef.current = false;
    });
  }, [searchParams]);

  // state -> URL
  useEffect(() => {
    if (isSyncingFromUrlRef.current || !urlInitializedRef.current) return;

    const p = new URLSearchParams();

    p.set('tab', tab);
    p.set('startDate', dateFilter.startDate || DEFAULT_START);
    p.set('endDate', dateFilter.endDate || DEFAULT_TODAY);
    if (searchTerm) p.set('search', searchTerm);

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
    tab,
    dateFilter.startDate,
    dateFilter.endDate,
    searchTerm,
    currentPage,
    itemsPerPage,
    setSearchParams,
    searchParams,
  ]);

  // Reset page when filters change
  useEffect(() => {
    const key = `${tab}||${searchTerm}||${dateFilter.startDate}||${dateFilter.endDate}`;
    const keyChanged = lastKeyRef.current !== key;

    if (didFilterOnceRef.current && keyChanged && !isSyncingFromUrlRef.current) {
      isUserPageChangeRef.current = false;
      setCurrentPage(1);
    }

    didFilterOnceRef.current = true;
    lastKeyRef.current = key;
  }, [tab, searchTerm, dateFilter.startDate, dateFilter.endDate]);

  const fetchRefunds = async () => {
    const res = await getAllRefundRequests({
      status: tab,
      search: debouncedSearchTerm || '',
      start_date: dateFilter.startDate,
      end_date: dateFilter.endDate,
      page: currentPage,
      limit: itemsPerPage,
      sort_by: 'created_at',
      sort_order: 'DESC',
    });

    const payload = res.data;
    const data = payload?.data || [];
    const t = payload?.pagination?.total ?? 0;

    setRows(data);
    setTotal(t);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setTableMsg({ type: '', text: '' });
        await fetchRefunds();
      } catch (e) {
        console.error(e);
        setRows([]);
        setTotal(0);
        setTableMsg({ type: 'error', text: 'Failed to load refunds' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedSearchTerm, dateFilter.startDate, dateFilter.endDate, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages && !isSyncingFromUrlRef.current) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // Export
  const hasActiveFilters =
    (searchTerm || '').trim() !== '' ||
    dateFilter.startDate !== DEFAULT_START ||
    dateFilter.endDate !== DEFAULT_TODAY;

  const mapRow = (r) => ({
    'Refund ID': r.id,
    Status: r.status,
    'Created At': r.created_at ? new Date(r.created_at).toLocaleString() : '',
    'Agent Name': r.agent_name || '',
    'Employee ID': r.employee_id || '',
    'Headset Number': r.headset_number || '',
    'Headset Type': formatHeadsetType(r.headset_type),
    'Temp Headset Number': r.temp_headset_number || '',
    'Temp Headset Type': formatHeadsetType(r.temp_headset_type),
    Reason: r.reason || '',
    'Reason Date': r.reason_date || '',
    'Headset Received': r.headset_received ? 'Yes' : 'No',
    'Return Condition': r.return_condition || '',
    'Eligible Amount': r.eligible_amount ?? '',
    'Approved Amount': r.approved_amount ?? '',
    'Processed At': r.processed_at ? new Date(r.processed_at).toLocaleString() : '',
    'Processed By': r.processed_by_name || '',
    Remarks: r.remarks || '',
  });

  const exportCurrentPage = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map(mapRow));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Page_${currentPage}`);
    XLSX.writeFile(wb, `Refunds_${tab}_Page_${currentPage}_${dateFilter.startDate}_to_${dateFilter.endDate}.xlsx`);
  };

  const exportAllFiltered = async () => {
    try {
      setTableMsg({ type: '', text: '' });

      const MAX_LIMIT = 100;
      let page = 1;
      let collected = [];

      while (true) {
        const res = await getAllRefundRequests({
          status: tab,
          search: debouncedSearchTerm || '',
          start_date: dateFilter.startDate,
          end_date: dateFilter.endDate,
          page,
          limit: MAX_LIMIT,
          sort_by: 'created_at',
          sort_order: 'DESC',
        });

        const payload = res.data;
        const data = payload?.data || [];
        collected = collected.concat(data);

        const t = payload?.pagination?.total ?? collected.length;
        if (collected.length >= t) break;

        page += 1;
        if (page > 200) break; // safety
      }

      const ws = XLSX.utils.json_to_sheet(collected.map(mapRow));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Refunds');

      const tabLabel = TAB_OPTIONS.find((t) => t.key === tab)?.label?.replace(/\s+/g, '_') || tab;
      XLSX.writeFile(wb, `Refunds_${tabLabel}_${dateFilter.startDate}_to_${dateFilter.endDate}.xlsx`);

      setTableMsg({ type: 'success', text: `Exported ${collected.length} refunds.` });
    } catch (e) {
      console.error(e);
      setTableMsg({ type: 'error', text: 'Export failed' });
    }
  };

  // Reopen (for not_eligible)
  const handleReopen = async (refundId) => {
    const row = rows.find((x) => x.id === refundId);
    if (!row) return;

    const ok = window.confirm(`Reopen Refund #${refundId} back to In Progress?`);
    if (!ok) return;

    const remarks = prompt('Remarks (optional):', row.remarks || '') ?? '';

    try {
      setRows((prev) => prev.map((x) => (x.id === refundId ? { ...x, _processing: true } : x)));
      await reopenRefundRequest(refundId, { remarks });
      setTableMsg({ type: 'success', text: `Refund #${refundId} reopened.` });
      await fetchRefunds();
    } catch (e) {
      console.error(e);
      setTableMsg({ type: 'error', text: e?.response?.data?.message || 'Failed to reopen refund' });
      setRows((prev) => prev.map((x) => (x.id === refundId ? { ...x, _processing: false } : x)));
    }
  };

  // Process
  const handleProcess = async (refundId) => {
    const row = rows.find((x) => x.id === refundId);
    if (!row) return;

    const defaultAmt = row.approved_amount ?? row.eligible_amount ?? 0;
    const input = prompt('Enter approved amount:', String(defaultAmt));
    if (input === null) return;

    const amt = Number(input);
    if (!Number.isFinite(amt) || amt < 0) {
      alert('Invalid amount');
      return;
    }

    const remarks = prompt('Remarks (optional):', row.remarks || '') ?? '';

    try {
      setRows((prev) => prev.map((x) => (x.id === refundId ? { ...x, _processing: true } : x)));
      await processRefundRequest(refundId, { approved_amount: amt, remarks });
      setTableMsg({ type: 'success', text: `Refund #${refundId} processed.` });
      await fetchRefunds();
    } catch (e) {
      console.error(e);
      setTableMsg({ type: 'error', text: e?.response?.data?.message || 'Failed to process refund' });
      setRows((prev) => prev.map((x) => (x.id === refundId ? { ...x, _processing: false } : x)));
    }
  };

  const handleMarkNotEligible = async (refundId) => {
    const row = rows.find((x) => x.id === refundId);
    if (!row) return;

    const confirm = window.confirm(`Mark Refund #${refundId} as Not Eligible?`);
    if (!confirm) return;

    const remarks = prompt('Reason/Remarks (optional):', row.remarks || '') ?? '';

    try {
      setRows((prev) => prev.map((x) => (x.id === refundId ? { ...x, _processing: true } : x)));
      await markRefundNotEligible(refundId, { remarks });
      setTableMsg({ type: 'success', text: `Refund #${refundId} marked as Not Eligible.` });
      await fetchRefunds();
    } catch (e) {
      console.error(e);
      setTableMsg({ type: 'error', text: e?.response?.data?.message || 'Failed to mark not eligible' });
      setRows((prev) => prev.map((x) => (x.id === refundId ? { ...x, _processing: false } : x)));
    }
  };

  return (
    <div className="refunds-container">
      <div className="container refunds-content">
        <div className="refunds-header-card">
          <div className="refunds-header-left">
            <h1 className="refunds-title">
              <i className="bi bi-arrow-repeat" /> Refunds
            </h1>
            <p className="refunds-subtitle">De-assignments → refunds tracking</p>
          </div>

          <div className="refunds-date-range">
            <input
              type="date"
              value={dateFilter.startDate}
              onChange={(e) => setDateFilter((p) => ({ ...p, startDate: e.target.value }))}
              className="refunds-date-input"
            />
            <span className="refunds-date-sep">to</span>
            <input
              type="date"
              value={dateFilter.endDate}
              onChange={(e) => setDateFilter((p) => ({ ...p, endDate: e.target.value }))}
              className="refunds-date-input"
            />
            <button
              className="refunds-reset-btn"
              type="button"
              onClick={() => setDateFilter({ startDate: DEFAULT_START, endDate: DEFAULT_TODAY })}
            >
              <i className="bi bi-arrow-counterclockwise" /> Reset
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="refunds-actions-card refunds-tabs">
          {TAB_OPTIONS.map((t) => (
            <button
              key={t.key}
              type="button"
              className="refunds-action-btn"
              onClick={() => setTab(t.key)}
              style={{
                border: tab === t.key ? '2px solid #2563eb' : '1px solid rgba(255,255,255,0.08)',
                opacity: tab === t.key ? 1 : 0.8,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="refunds-table-card">
          <div className="refunds-table-top">
            <div className="refunds-table-title">
              <h2>
                {TAB_OPTIONS.find((t) => t.key === tab)?.label} ({total})
              </h2>
              <p>Search + date filter + pagination + export</p>
            </div>

            <div className="refunds-table-controls">
              <div className="refunds-search">
                <i className="bi bi-search" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search agent / headset / reason..."
                />
              </div>

              <button
                className="refunds-export-btn"
                type="button"
                onClick={exportAllFiltered}
                disabled={total === 0}
                title={hasActiveFilters ? `Export ${total} filtered refunds` : `Export all ${total} refunds`}
              >
                <i className="bi bi-download" /> {hasActiveFilters ? 'Export Filtered' : 'Export All'} ({total})
              </button>
            </div>
          </div>

          <div className="refunds-table-meta">
            <div className="refunds-perpage">
              <label>Items per page:</label>
              <select
                className="refunds-select"
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
                className="refunds-export-btn refunds-export-page-btn"
                type="button"
                onClick={exportCurrentPage}
                disabled={rows.length === 0}
                title={`Export ${rows.length} rows from this page`}
              >
                <i className="bi bi-file-earmark" /> Export Page
              </button>
            </div>

            <div className="refunds-counts">
              Total: <strong>{total}</strong> | Page <strong>{currentPage}</strong> / <strong>{totalPages}</strong>
            </div>
          </div>

          {tableMsg.text && <div className={`refunds-table-alert ${tableMsg.type}`}>{tableMsg.text}</div>}

          {loading ? (
            <div className="refunds-loading">
              <div className="refunds-spinner" />
              <p>Loading refunds...</p>
            </div>
          ) : (
            <>
              <div className="refunds-table-wrap">
                <table className="refunds-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Created</th>
                      <th>Agent</th>
                      <th>Emp ID</th>
                      <th>Headset</th>
                      <th>Type</th>
                      <th>Temp Headset</th>
                      <th>Temp Type</th>
                      <th>Reason</th>
                      <th>Reason Date</th>
                      <th>Received</th>
                      <th>Return</th>
                      <th>Eligible</th>
                      <th>Approved</th>
                      <th>Processed</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((r) => {
                      const isProcessed = r.status === 'processed';
                      const isNotEligible = r.status === 'not_eligible';
                      const canProcess = !isProcessed && !isNotEligible;

                      return (
                        <tr key={r.id}>
                          <td>#{r.id}</td>
                          <td>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                          <td>{r.agent_name || '—'}</td>
                          <td>{r.employee_id || '—'}</td>
                          <td>{r.headset_number || '—'}</td>
                          <td>{formatHeadsetType(r.headset_type)}</td>
                          <td>{r.temp_headset_number || '—'}</td>
                          <td>{r.temp_headset_type ? formatHeadsetType(r.temp_headset_type) : '—'}</td>
                          <td>{r.reason || '—'}</td>
                          <td>{r.reason_date || '—'}</td>
                          <td>
                            {r.headset_received ? (
                              <span className="refunds-pill ok">Yes</span>
                            ) : (
                              <span className="refunds-pill bad">No</span>
                            )}
                          </td>
                          <td>{r.return_condition || '—'}</td>
                          <td>{r.eligible_amount ?? '—'}</td>
                          <td>{r.approved_amount ?? '—'}</td>
                          <td>{r.processed_at ? new Date(r.processed_at).toLocaleString() : '—'}</td>

                          <td>
                            {canProcess ? (
                              <div className="refunds-row-actions">
                                <button
                                  type="button"
                                  className="refunds-row-btn secondary"
                                  disabled={!!r._processing}
                                  onClick={() => handleProcess(r.id)}
                                  title="Mark as processed"
                                >
                                  {r._processing ? 'Processing...' : 'Process'}
                                </button>

                                <button
                                  type="button"
                                  className="refunds-row-btn danger"
                                  disabled={!!r._processing}
                                  onClick={() => handleMarkNotEligible(r.id)}
                                  title="Mark as not eligible"
                                >
                                  Not Eligible
                                </button>
                              </div>
                            ) : isNotEligible ? (
                              <div className="refunds-row-actions">
                                <span className="refunds-pill warn">Not Eligible</span>

                                <button
                                  type="button"
                                  className="refunds-row-btn secondary"
                                  disabled={!!r._processing}
                                  onClick={() => handleReopen(r.id)}
                                  title="Move back to In Progress"
                                >
                                  {r._processing ? 'Reopening...' : 'Reopen'}
                                </button>
                              </div>
                            ) : (
                              <span className="refunds-pill ok">Processed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={16} style={{ textAlign: 'center', padding: 20 }}>
                          No refunds found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="refunds-pagination">
                  <button
                    className="refunds-page-btn"
                    type="button"
                    onClick={() => {
                      isUserPageChangeRef.current = true;
                      setCurrentPage((p) => Math.max(1, p - 1));
                    }}
                    disabled={currentPage === 1}
                  >
                    <i className="bi bi-chevron-left" /> Prev
                  </button>

                  <span className="refunds-page-text">
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                  </span>

                  <button
                    className="refunds-page-btn"
                    type="button"
                    onClick={() => {
                      isUserPageChangeRef.current = true;
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                    }}
                    disabled={currentPage === totalPages}
                  >
                    Next <i className="bi bi-chevron-right" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}