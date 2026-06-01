import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import { useAuth } from '../auth/AuthContext';
import {
  createRepairLot,
  getRepairLots,
  getRepairLotById,
  addItemsToRepairLot,
  removeRepairLotItem,
  sendRepairLot,
  receiveRepairLotItems,
} from '../services/repairService';

import { searchDamagedOrRepairHeadsets } from '../services/headsetService';
import SmartPagination from '../components/SmartPagination';
import SearchableSelect from '../components/SearchableSelect';

import './Repairs.css';

const TABS = [
  { key: 'draft', label: 'Draft Lots', status: 'draft' },
  { key: 'sent', label: 'Sent Lots', status: 'sent' },
  { key: 'partial', label: 'Partially Received', status: 'partially_received' },
  { key: 'received', label: 'Received Lots', status: 'received' },
  { key: 'all', label: 'All Lots', status: '' },
];

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 20;
const ITEMS_PER_PAGE_OPTIONS = [10, 20, 30, 50, 100];

function toPositiveInt(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// YYYY-MM-DD
const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// default range: last 2 months (like your reference)
const DEFAULT_TODAY = toIso(new Date());
const twoMonthsBack = new Date();
twoMonthsBack.setMonth(twoMonthsBack.getMonth() - 2);
const DEFAULT_START = toIso(twoMonthsBack);

export default function Repairs() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: authLoading } = useAuth();

  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const urlInitializedRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);
  const tableCardRef = useRef(null);

  const initial = useMemo(() => {
    const tab = searchParams.get('tab') || 'draft';
    const search = searchParams.get('search') || '';
    const brand = searchParams.get('brand') || '';
    const startDate = searchParams.get('startDate') || DEFAULT_START;
    const endDate = searchParams.get('endDate') || DEFAULT_TODAY;

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const limit = toPositiveInt(searchParams.get('limit'), DEFAULT_ITEMS_PER_PAGE);

    return {
      tab: TABS.some((t) => t.key === tab) ? tab : 'draft',
      search,
      brand,
      startDate,
      endDate,
      page,
      limit,
    };
  }, [searchParams]);

  const [tab, setTab] = useState(initial.tab);
  const [search, setSearch] = useState(initial.search);
  const [brandGroup, setBrandGroup] = useState(initial.brand);
  const [dateFilter, setDateFilter] = useState({ startDate: initial.startDate, endDate: initial.endDate });
  const [page, setPage] = useState(initial.page);
  const [limit, setLimit] = useState(initial.limit);

  const [loading, setLoading] = useState(true);
  const [lots, setLots] = useState([]);
  const [total, setTotal] = useState(0);

  const [message, setMessage] = useState({ type: '', text: '' });

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    brand_group: 'voix',
    vendor_name: '',
    notes: '',
  });

  const [showLot, setShowLot] = useState(false);
  const [lotLoading, setLotLoading] = useState(false);
  const [lotDetail, setLotDetail] = useState(null);

  const [selectedHeadsetId, setSelectedHeadsetId] = useState('');

  // headsetId -> { checked, condition_after, receive_notes, alreadyReceived }
  const [receiveSelection, setReceiveSelection] = useState({});

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [authLoading, isAdmin, navigate]);

  const tabObj = useMemo(() => TABS.find((t) => t.key === tab) || TABS[0], [tab]);
  const canReceiveInThisTab = tabObj.key === 'sent' || tabObj.key === 'partial';

  const totalPages = Math.max(1, Math.ceil(total / limit));

  // Init prevPageRef
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

    const tabUrl = searchParams.get('tab') || 'draft';
    const searchUrl = searchParams.get('search') || '';
    const brandUrl = searchParams.get('brand') || '';
    const startDateUrl = searchParams.get('startDate') || DEFAULT_START;
    const endDateUrl = searchParams.get('endDate') || DEFAULT_TODAY;

    const pageUrl = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const limitUrl = toPositiveInt(searchParams.get('limit'), DEFAULT_ITEMS_PER_PAGE);

    setTab(TABS.some((t) => t.key === tabUrl) ? tabUrl : 'draft');
    setSearch(searchUrl);
    setBrandGroup(brandUrl);
    setDateFilter({ startDate: startDateUrl, endDate: endDateUrl });
    setPage(pageUrl);
    setLimit(limitUrl);

    prevPageRef.current = pageUrl;

    queueMicrotask(() => {
      isSyncingFromUrlRef.current = false;
    });
  }, [searchParams]);

  // state -> URL
  useEffect(() => {
    if (isSyncingFromUrlRef.current || !urlInitializedRef.current) return;

    const p = new URLSearchParams();
    p.set('tab', tab);

    if (search) p.set('search', search);
    if (brandGroup) p.set('brand', brandGroup);

    p.set('startDate', dateFilter.startDate || DEFAULT_START);
    p.set('endDate', dateFilter.endDate || DEFAULT_TODAY);

    p.set('page', String(page || 1));
    if (limit !== DEFAULT_ITEMS_PER_PAGE) p.set('limit', String(limit));

    const currentParams = new URLSearchParams(searchParams);
    if (p.toString() !== currentParams.toString()) {
      const pageChanged = prevPageRef.current !== page;
      const shouldPush = isUserPageChangeRef.current && pageChanged;
      setSearchParams(p, { replace: !shouldPush });

      prevPageRef.current = page;
      isUserPageChangeRef.current = false;
    }
  }, [tab, search, brandGroup, dateFilter.startDate, dateFilter.endDate, page, limit, setSearchParams, searchParams]);

  const loadLots = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await getRepairLots({
        search,
        brand_group: brandGroup,
        status: tabObj.status,
        start_date: dateFilter.startDate,
        end_date: dateFilter.endDate,
        page,
        limit,
        sort_order: 'DESC',
      });

      const rows = res.data?.data || [];
      const pg = res.data?.pagination;

      setLots(rows);
      setTotal(pg?.total ?? rows.length);
    } catch (e) {
      console.error(e);
      setLots([]);
      setTotal(0);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load repair lots.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, brandGroup, dateFilter.startDate, dateFilter.endDate, page, limit]);

  useEffect(() => {
    if (page > totalPages && !isSyncingFromUrlRef.current) setPage(totalPages);
  }, [totalPages, page]);

  const rebuildReceiveSelection = (lot) => {
    const items = lot?.items || [];
    const init = {};
    items.forEach((it) => {
      init[String(it.headsetId)] = {
        checked: false,
        condition_after: it.conditionAfter || 'good',
        receive_notes: it.receiveNotes || '',
        alreadyReceived: !!it.receivedAt,
      };
    });
    setReceiveSelection(init);
  };

  const refreshLotDetail = async (lotId) => {
    const res = await getRepairLotById(lotId);
    const lot = res.data?.data || null;
    setLotDetail(lot);
    rebuildReceiveSelection(lot);
  };

  const openLot = async (lotId) => {
    setShowLot(true);
    setLotDetail(null);
    setSelectedHeadsetId('');
    setReceiveSelection({});
    setMessage({ type: '', text: '' });

    try {
      setLotLoading(true);
      await refreshLotDetail(lotId);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load lot details.' });
    } finally {
      setLotLoading(false);
    }
  };

  const closeLot = () => {
    setShowLot(false);
    setLotDetail(null);
    setSelectedHeadsetId('');
    setReceiveSelection({});
  };

  const doCreateLot = async () => {
    try {
      if (!createForm.brand_group) {
        setMessage({ type: 'error', text: 'Please select brand group.' });
        return;
      }
      setCreating(true);

      const res = await createRepairLot({
        brand_group: createForm.brand_group,
        vendor_name: createForm.vendor_name || undefined,
        notes: createForm.notes || undefined,
      });

      setShowCreate(false);
      setCreateForm({ brand_group: 'voix', vendor_name: '', notes: '' });
      setMessage({ type: 'success', text: res.data?.message || 'Lot created' });

      await loadLots();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to create lot.' });
    } finally {
      setCreating(false);
    }
  };

  const doAddHeadset = async () => {
    if (!lotDetail?.id) return;
    if (!selectedHeadsetId) {
      setMessage({ type: 'error', text: 'Select a headset to add.' });
      return;
    }
    try {
      setLotLoading(true);
      await addItemsToRepairLot(lotDetail.id, [Number(selectedHeadsetId)]);
      await refreshLotDetail(lotDetail.id);
      setSelectedHeadsetId('');
      setMessage({ type: 'success', text: 'Headset added to lot.' });

      await loadLots();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to add headset.' });
    } finally {
      setLotLoading(false);
    }
  };

  const doRemoveItem = async (itemId) => {
    if (!lotDetail?.id) return;
    try {
      setLotLoading(true);
      await removeRepairLotItem(lotDetail.id, itemId);
      await refreshLotDetail(lotDetail.id);
      setMessage({ type: 'success', text: 'Item removed.' });

      await loadLots();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to remove item.' });
    } finally {
      setLotLoading(false);
    }
  };

  const doSendLot = async () => {
    if (!lotDetail?.id) return;
    try {
      setLotLoading(true);
      await sendRepairLot(lotDetail.id);
      setMessage({ type: 'success', text: 'Lot sent. Receive items when vendor returns them.' });

      setShowLot(false);
      setLotDetail(null);
      setSelectedHeadsetId('');
      setReceiveSelection({});

      await loadLots();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to send lot.' });
    } finally {
      setLotLoading(false);
    }
  };

  const doReceiveSelected = async () => {
    if (!lotDetail?.id) return;

    const items = Object.entries(receiveSelection)
      .filter(([, v]) => v.checked && !v.alreadyReceived)
      .map(([headsetId, v]) => ({
        headset_id: Number(headsetId),
        condition_after: v.condition_after,
        receive_notes: v.receive_notes || undefined,
      }));

    if (items.length === 0) {
      setMessage({ type: 'error', text: 'Select at least one not-yet-received headset.' });
      return;
    }

    try {
      setLotLoading(true);
      await receiveRepairLotItems(lotDetail.id, items);

      await refreshLotDetail(lotDetail.id);
      setMessage({ type: 'success', text: 'Receive updated.' });
      await loadLots();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to receive items.' });
    } finally {
      setLotLoading(false);
    }
  };

  const hasActiveFilters =
    (search || '').trim() !== '' ||
    (brandGroup || '').trim() !== '' ||
    dateFilter.startDate !== DEFAULT_START ||
    dateFilter.endDate !== DEFAULT_TODAY ||
    tab !== 'draft';

  // Export helpers
  const mapLot = (l) => ({
    'Lot ID': l.id,
    'Lot Code': l.lotCode,
    Group: l.brandGroup,
    Status: l.status,
    Vendor: l.vendorName || '',
    Notes: l.notes || '',
    'Items Total': l.itemsTotal,
    'Items Received': l.itemsReceived,
    'Sent At': l.sentAt ? new Date(l.sentAt).toLocaleString() : '',
    'Received At': l.receivedAt ? new Date(l.receivedAt).toLocaleString() : '',
  });

  const exportAllToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(lots.map(mapLot));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RepairLots');
    XLSX.writeFile(wb, `RepairLots_${tabObj.key}_${dateFilter.startDate}_to_${dateFilter.endDate}.xlsx`);
  };

  const exportCurrentPageToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(lots.map(mapLot));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Page_${page}`);
    XLSX.writeFile(wb, `RepairLots_Page_${page}_${dateFilter.startDate}_to_${dateFilter.endDate}.xlsx`);
  };

  // Export filtered/all: we already load server-side filtered results.
  // So "Export Filtered" == export current filters (all pages) by fetching pages.
  const exportFilteredAllPages = async () => {
    try {
      setMessage({ type: '', text: '' });

      const MAX_LIMIT = 100;
      let p = 1;
      let collected = [];

      while (true) {
        const res = await getRepairLots({
          search,
          brand_group: brandGroup,
          status: tabObj.status,
          start_date: dateFilter.startDate,
          end_date: dateFilter.endDate,
          page: p,
          limit: MAX_LIMIT,
          sort_order: 'DESC',
        });

        const rows = res.data?.data || [];
        collected = collected.concat(rows);

        const t = res.data?.pagination?.total ?? collected.length;
        if (collected.length >= t) break;

        p += 1;
        if (p > 200) break;
      }

      const ws = XLSX.utils.json_to_sheet(collected.map(mapLot));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'RepairLots');

      XLSX.writeFile(wb, `RepairLots_Filtered_${tabObj.key}_${dateFilter.startDate}_to_${dateFilter.endDate}.xlsx`);
      setMessage({ type: 'success', text: `Exported ${collected.length} lots.` });
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Export failed' });
    }
  };

  return (
    <div className="rep-container">
      <div className="container rep-content">
        {/* Top nav */}
        <div className="rep-top-nav">
          <button className="rep-btn-back" onClick={() => navigate('/dashboard')} type="button">
            <i className="bi bi-arrow-left" />
            <span>Back to Dashboard</span>
          </button>

          <div className="rep-top-actions">
            <button className="rep-btn secondary" onClick={loadLots} type="button">
              Refresh
            </button>
            <button className="rep-btn secondary" onClick={() => navigate('/repairs/replacements')} type="button">
              Temp Replacements
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="rep-header-card">
          <div className="rep-header-left">
            <h1 className="rep-title">
              <i className="bi bi-tools" />
              Repairs — Lots
            </h1>
            <p className="rep-subtitle">Create lots, send to vendor, and receive items (partial allowed).</p>
          </div>

          <div className="rep-header-stats">
            <div className="rep-stat-mini">
              <span className="rep-stat-mini-value">{total}</span>
              <span className="rep-stat-mini-label">Total</span>
            </div>
            <div className="rep-stat-mini">
              <span className="rep-stat-mini-value">{tabObj.label}</span>
              <span className="rep-stat-mini-label">Tab</span>
            </div>
          </div>
        </div>

        {message.text && <div className={`rep-alert ${message.type}`}>{message.text}</div>}

        {/* Tabs */}
        <div className="rep-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`rep-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => {
                isUserPageChangeRef.current = false;
                setPage(1);
                setTab(t.key);
              }}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters card (search/date/export/limit/brand) */}
        <div className="rep-filters-card">
          <div className="rep-filters-row">
            <div className="rep-search-wrapper">
              <i className="bi bi-search" />
              <input
                type="text"
                placeholder="Search lot code / vendor / notes..."
                value={search}
                onChange={(e) => {
                  isUserPageChangeRef.current = false;
                  setPage(1);
                  setSearch(e.target.value);
                }}
              />
              {search && (
                <button
                  className="rep-search-clear"
                  onClick={() => {
                    isUserPageChangeRef.current = false;
                    setPage(1);
                    setSearch('');
                  }}
                  type="button"
                  title="Clear"
                >
                  <i className="bi bi-x-circle-fill" />
                </button>
              )}
            </div>

            <div className="rep-status-pills">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  className={`rep-pill ${tab === t.key ? 'active' : ''}`}
                  onClick={() => {
                    isUserPageChangeRef.current = false;
                    setPage(1);
                    setTab(t.key);
                  }}
                  type="button"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rep-filters-row secondary">
            <div className="rep-date-range">
              <input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => {
                  isUserPageChangeRef.current = false;
                  setPage(1);
                  setDateFilter((p) => ({ ...p, startDate: e.target.value }));
                }}
                className="rep-date-input"
              />
              <span className="rep-date-separator">to</span>
              <input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => {
                  isUserPageChangeRef.current = false;
                  setPage(1);
                  setDateFilter((p) => ({ ...p, endDate: e.target.value }));
                }}
                className="rep-date-input"
              />
              <button
                className="rep-date-reset"
                onClick={() => {
                  isUserPageChangeRef.current = false;
                  setPage(1);
                  setDateFilter({ startDate: DEFAULT_START, endDate: DEFAULT_TODAY });
                }}
                type="button"
              >
                <i className="bi bi-arrow-counterclockwise" />
                Reset
              </button>
            </div>

            <select
              className="rep-select"
              value={brandGroup}
              onChange={(e) => {
                isUserPageChangeRef.current = false;
                setPage(1);
                setBrandGroup(e.target.value);
              }}
              title="Brand group filter"
            >
              <option value="">All (voix+tech)</option>
              <option value="voix">Voix</option>
              <option value="tech">Tech</option>
            </select>

            <select
              className="rep-select"
              value={limit}
              onChange={(e) => {
                isUserPageChangeRef.current = false;
                setPage(1);
                setLimit(toPositiveInt(e.target.value, DEFAULT_ITEMS_PER_PAGE));
              }}
              title="Items per page"
            >
              {ITEMS_PER_PAGE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>

            <div className="rep-actions">
              {hasActiveFilters ? (
                <button
                  className="rep-action-btn filtered"
                  onClick={exportFilteredAllPages}
                  disabled={total === 0}
                  type="button"
                  title={`Export ${total} filtered lots`}
                >
                  <i className="bi bi-funnel" />
                  Export Filtered ({total})
                </button>
              ) : (
                <button
                  className="rep-action-btn"
                  onClick={exportAllToExcel}
                  disabled={total === 0}
                  type="button"
                  title={`Export all ${total} lots`}
                >
                  <i className="bi bi-download" />
                  Export All ({total})
                </button>
              )}

              <button
                className="rep-action-btn secondary"
                onClick={exportCurrentPageToExcel}
                disabled={lots.length === 0}
                type="button"
                title={`Export ${lots.length} lots from this page`}
              >
                <i className="bi bi-file-earmark" />
                Export Page ({lots.length})
              </button>

              <button className="rep-action-btn create" type="button" onClick={() => setShowCreate(true)} disabled={tab !== 'draft'}>
                + Create Lot
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="rep-loading">
            <div className="rep-spinner" />
            <p>Loading repair lots...</p>
          </div>
        ) : lots.length === 0 ? (
          <div className="rep-empty">
            <i className="bi bi-inbox" />
            <h3>No lots found</h3>
            <p>Try adjusting your filters or date range.</p>
          </div>
        ) : (
          <>
            <div className="rep-table-card" ref={tableCardRef}>
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Vendor</th>
                    <th>Items</th>
                    <th>Sent</th>
                    <th>Received</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <b>{l.lotCode}</b>
                        <div className="rep-muted">#{l.id}</div>
                      </td>
                      <td>{l.brandGroup}</td>
                      <td>{l.status}</td>
                      <td>{l.vendorName || '—'}</td>
                      <td>
                        {l.itemsReceived}/{l.itemsTotal}
                      </td>
                      <td>{l.sentAt ? new Date(l.sentAt).toLocaleString() : '—'}</td>
                      <td>{l.receivedAt ? new Date(l.receivedAt).toLocaleString() : '—'}</td>
                      <td>
                        <button className="rep-table-btn" type="button" onClick={() => openLot(l.id)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
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
                className="rep-pagination-card"
              />
            )}
          </>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="rep-modal-backdrop" onClick={() => setShowCreate(false)}>
            <div className="rep-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="rep-modal-title">Create Repair Lot</h3>

              <label className="rep-modal-label">Brand Group *</label>
              <select
                className="rep-modal-input"
                value={createForm.brand_group}
                onChange={(e) => setCreateForm((p) => ({ ...p, brand_group: e.target.value }))}
              >
                <option value="voix">voix</option>
                <option value="tech">tech</option>
              </select>

              <label className="rep-modal-label">Vendor (optional)</label>
              <input
                className="rep-modal-input"
                value={createForm.vendor_name}
                onChange={(e) => setCreateForm((p) => ({ ...p, vendor_name: e.target.value }))}
              />

              <label className="rep-modal-label">Notes (optional)</label>
              <textarea
                className="rep-modal-input"
                rows={3}
                value={createForm.notes}
                onChange={(e) => setCreateForm((p) => ({ ...p, notes: e.target.value }))}
              />

              <div className="rep-modal-actions">
                <button className="rep-action-btn secondary" onClick={() => setShowCreate(false)} type="button" disabled={creating}>
                  Cancel
                </button>
                <button className="rep-action-btn" onClick={doCreateLot} type="button" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lot modal */}
        {showLot && (
          <div className="rep-modal-backdrop" onClick={closeLot}>
            <div className="rep-modal wide" onClick={(e) => e.stopPropagation()}>
              <div className="rep-modal-top">
                <h3 className="rep-modal-title" style={{ margin: 0 }}>
                  Lot: {lotDetail?.lotCode || '...'}
                </h3>
                <button className="rep-action-btn secondary" type="button" onClick={closeLot}>
                  Close
                </button>
              </div>

              {lotLoading ? (
                <div style={{ marginTop: 10 }}>Loading...</div>
              ) : lotDetail ? (
                <>
                  <div className="rep-modal-meta">
                    <div><b>Group:</b> {lotDetail.brandGroup}</div>
                    <div><b>Status:</b> {lotDetail.status}</div>
                    <div><b>Vendor:</b> {lotDetail.vendorName || '—'}</div>
                    <div><b>Sent:</b> {lotDetail.sentAt ? new Date(lotDetail.sentAt).toLocaleString() : '—'}</div>
                    <div><b>Received:</b> {lotDetail.receivedAt ? new Date(lotDetail.receivedAt).toLocaleString() : '—'}</div>
                  </div>

                  {lotDetail.status === 'draft' && (
                    <div className="rep-inline-card">
                      <div className="rep-inline-title">Add damaged/repair headset to lot</div>
                      <div className="rep-inline-row">
                        <div style={{ flex: 1 }}>
                          <SearchableSelect
                            value={selectedHeadsetId}
                            onChange={setSelectedHeadsetId}
                            placeholder="Type headset # to search (damaged/repair)..."
                            minChars={1}
                            onSearch={async (q) => {
                              const rows = await searchDamagedOrRepairHeadsets({
                                q,
                                brand_group: lotDetail.brandGroup,
                              });
                              return rows.map((h) => ({
                                value: String(h.id),
                                label: `${h.headsetNumber} • ${h.status} • ${h.headsetType}`,
                                meta: h,
                              }));
                            }}
                          />
                        </div>
                        <button className="rep-action-btn" type="button" onClick={doAddHeadset}>
                          Add
                        </button>
                        <button
                          className="rep-action-btn secondary"
                          type="button"
                          onClick={doSendLot}
                          disabled={(lotDetail.items || []).length === 0}
                        >
                          Mark Sent
                        </button>
                      </div>
                    </div>
                  )}

                  {(lotDetail.status === 'sent' || lotDetail.status === 'partially_received') && !canReceiveInThisTab && (
                    <div className="rep-inline-card">
                      <div className="rep-inline-title">Lot in receiving stage.</div>
                      <div className="rep-muted" style={{ marginTop: 6 }}>
                        Switch to <b>Sent Lots</b> / <b>Partially Received</b> tab to receive items.
                      </div>
                    </div>
                  )}

                  {(lotDetail.status === 'sent' || lotDetail.status === 'partially_received') && canReceiveInThisTab && (
                    <div className="rep-inline-card">
                      <div className="rep-inline-title">Receive selected headsets (partial allowed)</div>
                      <button className="rep-action-btn" type="button" onClick={doReceiveSelected}>
                        Receive Selected
                      </button>
                      <div className="rep-muted" style={{ marginTop: 6 }}>
                        Tip: Tick headsets that arrived today, set condition_after, then click Receive Selected.
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 12 }}>
                    {(lotDetail.items || []).length === 0 ? (
                      <div>No items in this lot yet.</div>
                    ) : (
                      <table className="rep-table">
                        <thead>
                          <tr>
                            {(lotDetail.status === 'sent' || lotDetail.status === 'partially_received') && canReceiveInThisTab && (
                              <th>Select</th>
                            )}
                            <th>Headset</th>
                            <th>Status</th>
                            <th>Cond Before</th>
                            <th>Cond After</th>
                            <th>Received</th>
                            {lotDetail.status === 'draft' && <th>Action</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {lotDetail.items.map((it) => {
                            const sel = receiveSelection[String(it.headsetId)];
                            const already = !!it.receivedAt;

                            return (
                              <tr key={it.id}>
                                {(lotDetail.status === 'sent' || lotDetail.status === 'partially_received') && canReceiveInThisTab && (
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={!!sel?.checked}
                                      disabled={already}
                                      onChange={(e) => {
                                        setReceiveSelection((p) => ({
                                          ...p,
                                          [String(it.headsetId)]: {
                                            ...(p[String(it.headsetId)] || {}),
                                            checked: e.target.checked,
                                          },
                                        }));
                                      }}
                                    />
                                  </td>
                                )}

                                <td>
                                  <b>{it.headsetNumber}</b>
                                  <div className="rep-muted">{it.headsetType}</div>
                                </td>

                                <td>{it.headsetStatus}</td>
                                <td>{it.conditionBefore || '—'}</td>

                                <td>
                                  {(lotDetail.status === 'sent' || lotDetail.status === 'partially_received') && canReceiveInThisTab ? (
                                    <select
                                      className="rep-select"
                                      value={sel?.condition_after || 'good'}
                                      disabled={already}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setReceiveSelection((p) => ({
                                          ...p,
                                          [String(it.headsetId)]: {
                                            ...(p[String(it.headsetId)] || {}),
                                            condition_after: v,
                                          },
                                        }));
                                      }}
                                    >
                                      <option value="good">good</option>
                                      <option value="fair">fair</option>
                                      <option value="damaged">damaged</option>
                                      <option value="lost">lost</option>
                                    </select>
                                  ) : (
                                    it.conditionAfter || '—'
                                  )}
                                </td>

                                <td>{it.receivedAt ? new Date(it.receivedAt).toLocaleString() : '—'}</td>

                                {lotDetail.status === 'draft' && (
                                  <td>
                                    <button className="rep-table-btn danger" type="button" onClick={() => doRemoveItem(it.id)}>
                                      Remove
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 10 }}>Failed to load lot.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}