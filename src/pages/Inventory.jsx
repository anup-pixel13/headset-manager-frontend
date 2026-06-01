import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import {
  getAllHeadsets,
  getHeadsetBrands,
  getInventorySummary,
  // ✅ add these in headsetService.js
  markHeadsetLost,
  markHeadsetDamaged,
  retireHeadset,
} from '../services/headsetService';

import { useAuth } from '../auth/AuthContext';
import SmartPagination from '../components/SmartPagination';
import './Inventory.css';

import { useListReturnFocus } from '../hooks/useListReturnFocus';
import { formatHeadsetType, formatBrandName } from '../utils/headsetFormat';
import { rememberListFocus } from '../utils/listReturnFocus';

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 12;
const ITEMS_PER_PAGE_OPTIONS = [6, 9, 12, 15, 30, 60, 90];

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'repair', label: 'Repair' },
  { key: 'damaged', label: 'Damaged' },
  { key: 'lost', label: 'Lost' },
  { key: 'retired', label: 'Retired' },
];

const CONDITION_OPTIONS = ['brand_new', 'good', 'fair', 'damaged', 'lost'];

function toPositiveInt(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function assignmentKindLabel(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'temp_replacement') return 'TEMP';
  if (k === 'permanent') return 'PERM';
  return kind ? String(kind).toUpperCase() : '';
}

function isTempAssignment(kind) {
  return String(kind || '').toLowerCase() === 'temp_replacement';
}

export default function Inventory() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSyncingFromUrlRef = useRef(false);
  const tableCardRef = useRef(null);
  const cardRefs = useRef({});

  const initial = useMemo(() => {
    return {
      search: searchParams.get('search') || '',
      status: searchParams.get('status') || 'all',
      type: searchParams.get('type') || 'all',
      brand: searchParams.get('brand') || 'all',
      condition: searchParams.get('condition') || 'all',
      page: toPositiveInt(searchParams.get('page'), DEFAULT_PAGE),
      perPage: toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE),
      sortBy: searchParams.get('sortBy') || 'headset_number',
      sortOrder: searchParams.get('sortOrder') || 'ASC',
    };
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [headsets, setHeadsets] = useState([]);
  const [total, setTotal] = useState(0);

  const [brands, setBrands] = useState([]);
  const [summary, setSummary] = useState(null);

  // filters
  const [search, setSearch] = useState(initial.search);
  const [status, setStatus] = useState(initial.status);
  const [type, setType] = useState(initial.type);
  const [brand, setBrand] = useState(initial.brand);
  const [condition, setCondition] = useState(initial.condition);

  // pagination + sort
  const [page, setPage] = useState(initial.page);
  const [perPage, setPerPage] = useState(initial.perPage);
  const [sortBy, setSortBy] = useState(initial.sortBy);
  const [sortOrder, setSortOrder] = useState(initial.sortOrder);

  // action menu per-card
  const [openMenuId, setOpenMenuId] = useState(null);
  const [actionBusyId, setActionBusyId] = useState(null);
  const focusedItemId = useListReturnFocus({
    ready: !loading,
    getElementForItem: (id) => cardRefs.current[String(id)],
  });

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const refreshSummary = async () => {
    try {
      const s = await getInventorySummary();
      setSummary(s.data?.data || null);
    } catch {
      // non-blocking
    }
  };

  const refreshList = async () => {
    const res = await getAllHeadsets({
      search,
      status: status === 'all' ? '' : status,
      headset_type: type === 'all' ? '' : type,
      brand_id: brand === 'all' ? '' : brand,
      condition: condition === 'all' ? '' : condition,
      // ✅ removed is_brand_new
      page,
      limit: perPage,
      sort_by: sortBy,
      sort_order: sortOrder,
    });

    const rows = res.data?.data || [];
    const t = res.data?.pagination?.total ?? 0;

    setHeadsets(rows);
    setTotal(t);
  };

  // URL -> state
  useEffect(() => {
    isSyncingFromUrlRef.current = true;

    setSearch(searchParams.get('search') || '');
    setStatus(searchParams.get('status') || 'all');
    setType(searchParams.get('type') || 'all');
    setBrand(searchParams.get('brand') || 'all');
    setCondition(searchParams.get('condition') || 'all');

    setPage(toPositiveInt(searchParams.get('page'), DEFAULT_PAGE));
    setPerPage(toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE));

    setSortBy(searchParams.get('sortBy') || 'headset_number');
    setSortOrder(searchParams.get('sortOrder') || 'ASC');

    queueMicrotask(() => (isSyncingFromUrlRef.current = false));
  }, [searchParams]);

  // state -> URL
  useEffect(() => {
    if (isSyncingFromUrlRef.current) return;

    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (status !== 'all') p.set('status', status);
    if (type !== 'all') p.set('type', type);
    if (brand !== 'all') p.set('brand', brand);
    if (condition !== 'all') p.set('condition', condition);

    p.set('page', String(page));
    if (perPage !== DEFAULT_ITEMS_PER_PAGE) p.set('perPage', String(perPage));

    if (sortBy !== 'headset_number') p.set('sortBy', sortBy);
    if (sortOrder !== 'ASC') p.set('sortOrder', sortOrder);

    if (p.toString() !== searchParams.toString()) {
      setSearchParams(p, { replace: true });
    }
  }, [search, status, type, brand, condition, page, perPage, sortBy, sortOrder, setSearchParams, searchParams]);

  // dropdown data
  useEffect(() => {
    (async () => {
      try {
        const [b, s] = await Promise.all([getHeadsetBrands(), getInventorySummary()]);
        setBrands(b.data?.data || []);
        setSummary(s.data?.data || null);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // fetch headsets
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await refreshList();
      } catch (e) {
        console.error(e);
        alert('Failed to load inventory');
        setHeadsets([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, type, brand, condition, page, perPage, sortBy, sortOrder]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const clearAll = () => {
    setSearch('');
    setStatus('all');
    setType('all');
    setBrand('all');
    setCondition('all');
    setSortBy('headset_number');
    setSortOrder('ASC');
    setPage(1);
    setPerPage(DEFAULT_ITEMS_PER_PAGE);
  };

  const exportCurrentPage = () => {
    const excelData = headsets.map((h) => ({
      'Headset #': h.headsetNumber,
      Type: formatHeadsetType(h.headsetType),
      Status: h.status,
      Condition: h.condition,
      Brand: formatBrandName(h.brand?.name || ''),
      'Assigned To': h.assignment?.agent?.name || '',
      'Emp ID': h.assignment?.agent?.employeeId || '',
      Process: h.assignment?.process || '',
      'Assignment ID': h.assignment?.id || '',
      'Assignment Kind': h.assignment?.assignmentKind || '',
      'Assignment Date': h.assignment?.assignmentDate ? new Date(h.assignment.assignmentDate).toLocaleString() : '',
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Page_${page}`);

    XLSX.writeFile(wb, `Inventory_Page_${page}.xlsx`);
  };

  const exportAllFiltered = async () => {
    try {
      const MAX_LIMIT = 100;
      let p = 1;
      let collected = [];

      while (true) {
        const res = await getAllHeadsets({
          search,
          status: status === 'all' ? '' : status,
          headset_type: type === 'all' ? '' : type,
          brand_id: brand === 'all' ? '' : brand,
          condition: condition === 'all' ? '' : condition,
          page: p,
          limit: MAX_LIMIT,
          sort_by: sortBy,
          sort_order: sortOrder,
        });

        const rows = res.data?.data || [];
        const totalFromApi = res.data?.pagination?.total ?? 0;

        collected = collected.concat(rows);
        if (collected.length >= totalFromApi) break;

        p += 1;
        if (p > 300) break;
      }

      const excelData = collected.map((h) => ({
        'Headset #': h.headsetNumber,
        Type: formatHeadsetType(h.headsetType),
        Status: h.status,
        Condition: h.condition,
        Brand: formatBrandName(h.brand?.name || ''),
        'Assigned To': h.assignment?.agent?.name || '',
        'Emp ID': h.assignment?.agent?.employeeId || '',
        Process: h.assignment?.process || '',
        'Assignment ID': h.assignment?.id || '',
        'Assignment Kind': h.assignment?.assignmentKind || '',
        'Assignment Date': h.assignment?.assignmentDate ? new Date(h.assignment.assignmentDate).toLocaleString() : '',
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');

      XLSX.writeFile(wb, `Inventory_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error(e);
      alert('Export failed');
    }
  };

  const typeOptions = useMemo(() => {
    const set = new Set();
    (summary?.byType || []).forEach((t) => set.add(t.type));
    headsets.forEach((h) => h.headsetType && set.add(h.headsetType));
    return ['all', ...Array.from(set).sort()];
  }, [summary, headsets]);

  const doAction = async (headset, action) => {
    if (!headset?.id) return;

    const headsetId = headset.id;
    setOpenMenuId(null);

    // unassigned check for retire
    const isAssigned = headset.status === 'assigned' || !!headset.assignment;

    if (action === 'retire' && isAssigned) {
      alert('Retire is allowed only for unassigned headsets.');
      return;
    }

    let remarks = '';
    if (action === 'lost') {
      remarks = window.prompt('Remarks (optional):', 'Marked lost from Inventory') || '';
    } else if (action === 'damaged') {
      remarks = window.prompt('Remarks (optional):', 'Marked damaged from Inventory') || '';
    } else if (action === 'retire') {
      remarks = window.prompt('Remarks (optional):', 'Retired from Inventory') || '';
    }

    try {
      setActionBusyId(headsetId);

      if (action === 'lost') {
        await markHeadsetLost(headsetId, { remarks });
      } else if (action === 'damaged') {
        await markHeadsetDamaged(headsetId, { remarks });
      } else if (action === 'retire') {
        await retireHeadset(headsetId, { remarks });
      }

      await Promise.all([refreshList(), refreshSummary()]);
    } catch (e) {
      console.error(e);
      alert(e?.response?.data?.message || 'Action failed');
    } finally {
      setActionBusyId(null);
    }
  };

  const navigateWithFocus = (itemId, to) => {
    rememberListFocus(location, itemId);
    navigate(to);
  };

  return (
    <div className="inv-container">
      <div className="container inv-content">
        <div className="inv-top-nav">
          <button className="inv-btn-back" onClick={() => navigate('/dashboard')} type="button">
            <i className="bi bi-arrow-left" /> Back to Dashboard
          </button>

          {isAdmin && (
            <button className="inv-action-btn create" onClick={() => navigate('/add-headset')} type="button">
              <i className="bi bi-plus-circle" /> Add Headset
            </button>
          )}
        </div>

        <div className="inv-header-card">
          <div className="inv-header-left">
            <h1 className="inv-title">
              <i className="bi bi-headset" /> Inventory
            </h1>
            <p className="inv-subtitle">Search, filter and export headset inventory</p>
          </div>

          <div className="inv-header-stats">
            <div className="inv-stat-mini">
              <span className="inv-stat-mini-value">{summary?.overall?.total ?? '-'}</span>
              <span className="inv-stat-mini-label">Total</span>
            </div>
            <div className="inv-stat-mini">
              <span className="inv-stat-mini-value">{summary?.overall?.available ?? '-'}</span>
              <span className="inv-stat-mini-label">Available</span>
            </div>
            <div className="inv-stat-mini">
              <span className="inv-stat-mini-value">{summary?.overall?.assigned ?? '-'}</span>
              <span className="inv-stat-mini-label">Assigned</span>
            </div>
          </div>
        </div>

        {/* Status tabs */}
        <div className="inv-tabs-card">
          <div className="inv-tabs">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                className={`inv-tab ${status === t.key ? 'active' : ''}`}
                type="button"
                onClick={() => {
                  setPage(1);
                  setStatus(t.key);
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="inv-filters-card">
          <div className="inv-filters-row">
            <div className="inv-search">
              <i className="bi bi-search" />
              <input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Search headset # / agent name / employee id..."
              />
              {search && (
                <button className="inv-search-clear" type="button" onClick={() => setSearch('')}>
                  <i className="bi bi-x-circle-fill" />
                </button>
              )}
            </div>

            <select
              className="inv-select"
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'All Types' : formatHeadsetType(t)}
                </option>
              ))}
            </select>

            <select
              className="inv-select"
              value={brand}
              onChange={(e) => {
                setPage(1);
                setBrand(e.target.value);
              }}
            >
              <option value="all">All Brands</option>
              {brands.map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {formatBrandName(b.brand_name)}
                </option>
              ))}
            </select>

            <select
              className="inv-select"
              value={condition}
              onChange={(e) => {
                setPage(1);
                setCondition(e.target.value);
              }}
            >
              <option value="all">All Conditions</option>
              {CONDITION_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="inv-filters-row secondary">
            <div className="inv-perpage">
              <label>Items per page:</label>
              <select
                className="inv-select"
                value={perPage}
                onChange={(e) => {
                  setPage(1);
                  setPerPage(toPositiveInt(e.target.value, DEFAULT_ITEMS_PER_PAGE));
                }}
              >
                {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="inv-sort">
              <label>Sort:</label>
              <select className="inv-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="headset_number">Headset #</option>
                <option value="status">Status</option>
                <option value="condition_status">Condition</option>
                <option value="created_at">Created</option>
                <option value="purchase_date">Purchase Date</option>
              </select>
              <select className="inv-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="ASC">ASC</option>
                <option value="DESC">DESC</option>
              </select>
            </div>

            <div className="inv-actions">
              <button className="inv-action-btn" type="button" onClick={exportAllFiltered} disabled={total === 0}>
                <i className="bi bi-download" /> Export All ({total})
              </button>
              <button
                className="inv-action-btn secondary"
                type="button"
                onClick={exportCurrentPage}
                disabled={headsets.length === 0}
              >
                <i className="bi bi-file-earmark" /> Export Page ({headsets.length})
              </button>
              <button className="inv-action-btn danger" type="button" onClick={clearAll}>
                <i className="bi bi-x-circle" /> Clear
              </button>
            </div>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="inv-loading">
            <div className="inv-spinner" />
            <p>Loading inventory...</p>
          </div>
        ) : headsets.length === 0 ? (
          <div className="inv-empty">
            <i className="bi bi-inbox" />
            <h3>No headsets found</h3>
            <p>Try adjusting filters</p>
          </div>
        ) : (
          <>
            <div className="inv-grid" ref={tableCardRef}>
              {headsets.map((h) => {
                const assigned = !!h.assignment;
                const kind = h.assignment?.assignmentKind || '';
                const isTemp = isTempAssignment(kind);

                // retire allowed only when unassigned
                const canRetire = !assigned && h.status !== 'assigned';

                return (
                  <div
                    key={h.id}
                    ref={(el) => {
                      if (el) {
                        cardRefs.current[String(h.id)] = el;
                      } else {
                        delete cardRefs.current[String(h.id)];
                      }
                    }}
                    className={`inv-card ${String(h.id) === String(focusedItemId) ? 'inv-card-focused' : ''}`}
                    data-status={h.status}
                  >
                    <div className="inv-card-header">
                      <div className="inv-card-title">
                        <span className="inv-headset-number">{h.headsetNumber}</span>
                        <span className={`inv-badge ${h.status}`}>{h.status}</span>
                      </div>

                      <div className="inv-card-sub">
                        <span>{formatHeadsetType(h.headsetType)}</span>
                        <span>•</span>
                        <span>{formatBrandName(h.brand?.name || '')}</span>
                      </div>
                    </div>

                    <div className="inv-card-body">
                      <div className="inv-info">
                        <div>
                          <strong>Condition:</strong> {h.condition || 'N/A'}
                        </div>
                      </div>

                      {assigned ? (
                        <div className="inv-assignment">
                          <div className="inv-assignment-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="bi bi-person-check" /> Assigned
                            {kind && (
                              <span className={`inv-pill ${isTemp ? 'temp' : 'perm'}`}>
                                {assignmentKindLabel(kind)}
                              </span>
                            )}
                          </div>
                          <div>
                            <strong>Agent:</strong> {h.assignment.agent?.name}
                          </div>
                          <div>
                            <strong>Emp ID:</strong> {h.assignment.agent?.employeeId}
                          </div>
                          <div>
                            <strong>Process:</strong> {h.assignment.process}
                          </div>
                        </div>
                      ) : (
                        <div className="inv-unassigned">
                          <i className="bi bi-box-seam" /> Not assigned
                        </div>
                      )}
                    </div>

                    <div className="inv-card-actions" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <button className="inv-card-btn view" type="button" onClick={() => navigateWithFocus(h.id, `/headsets/${h.id}`)}>
                        <i className="bi bi-eye" /> View Headset
                      </button>

                      <button
                        className="inv-card-btn secondary"
                        type="button"
                        onClick={() => navigateWithFocus(h.id, `/headsets/${h.id}/assignments`)}
                      >
                        <i className="bi bi-clock-history" /> Assignment History
                      </button>

                      <button
                        className="inv-card-btn secondary"
                        type="button"
                        disabled={!assigned}
                        title={!assigned ? 'No current assignment' : 'View current assignment'}
                        onClick={() => navigateWithFocus(h.id, `/assignments/${h.assignment?.id}`)}
                      >
                        <i className="bi bi-person-lines-fill" /> Current Assignment
                      </button>

                      <button
                        className="inv-card-btn secondary"
                        type="button"
                        onClick={() => navigateWithFocus(h.id, `/headsets/${h.id}/repairs`)}
                      >
                        <i className="bi bi-wrench-adjustable" /> Repair History
                      </button>

                      <div className="inv-actions-menu" style={{ position: 'relative' }}>
                        <button
                          className="inv-card-btn actions"
                          type="button"
                          onClick={() => setOpenMenuId((prev) => (prev === h.id ? null : h.id))}
                          disabled={actionBusyId === h.id}
                          title="Actions"
                        >
                          <i className="bi bi-three-dots-vertical" /> Actions
                        </button>

                        {openMenuId === h.id && (
                          <div className="inv-actions-dropdown">
                            <button type="button" onClick={() => doAction(h, 'lost')}>
                              Mark Lost
                            </button>
                            <button type="button" onClick={() => doAction(h, 'damaged')}>
                              Mark Damaged
                            </button>
                            <button type="button" onClick={() => doAction(h, 'retire')} disabled={!canRetire} title={!canRetire ? 'Retire allowed only when unassigned' : ''}>
                              Retire
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <SmartPagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(targetPage, anchor) => {
                  void anchor;
                  setPage(targetPage);
                }}
                scrollTargetRef={tableCardRef}
                className="inv-pagination-card"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}