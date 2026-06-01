import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import { getAllAgents, getProcessesForDropdown } from '../services/agentService';
import SmartPagination from '../components/SmartPagination';

import './Dashboard.css';

const DEFAULT_PAGE = 1;
const DEFAULT_ITEMS_PER_PAGE = 9;
const ITEMS_PER_PAGE_OPTIONS = [6, 9, 12, 15, 30, 60, 90];

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

const DEFAULT_AGENT_STATUS = 'all';     // agents.status
const DEFAULT_LOGIN_STATUS = 'active';  // users.is_active
const DEFAULT_HAS_HEADSET = 'all';      // tri-state

function loginStatusToApi(v) {
  if (v === 'active') return 'true';
  if (v === 'inactive') return 'false';
  return '';
}

export default function Agents() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const isInitialMountRef = useRef(true);
  const isSyncingFromUrlRef = useRef(false);
  const urlInitializedRef = useRef(false);
  const prevPageRef = useRef(null);
  const isUserPageChangeRef = useRef(false);
  const didFilterOnceRef = useRef(false);
  const lastKeyRef = useRef('');

  const tableCardRef = useRef(null);

  // Read URL once on mount only (avoids re-derivation on every searchParams change)
  const initial = useMemo(() => {
    const search = searchParams.get('search') || '';
    const agentStatus = searchParams.get('agentStatus') || DEFAULT_AGENT_STATUS;
    const loginStatus = searchParams.get('loginStatus') || DEFAULT_LOGIN_STATUS;
    const hasHeadset = searchParams.get('hasHeadset') || DEFAULT_HAS_HEADSET;
    const processId = searchParams.get('processId') || 'all';

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    return {
      search,
      agentStatus,
      loginStatus,
      hasHeadset,
      processId,
      page,
      perPage,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [searchTerm, setSearchTerm] = useState(initial.search);
  const [agentStatus, setAgentStatus] = useState(initial.agentStatus);
  const [loginStatus, setLoginStatus] = useState(initial.loginStatus);
  const [hasHeadset, setHasHeadset] = useState(initial.hasHeadset);
  const [processId, setProcessId] = useState(initial.processId);

  const [currentPage, setCurrentPage] = useState(initial.page);
  const [itemsPerPage, setItemsPerPage] = useState(initial.perPage);

  const [loading, setLoading] = useState(true);
  const [tableMsg, setTableMsg] = useState({ type: '', text: '' });

  const [agents, setAgents] = useState([]);
  const [total, setTotal] = useState(0);

  const [processOptions, setProcessOptions] = useState([{ id: 'all', name: 'All Processes' }]);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 400);

  useEffect(() => {
    if (prevPageRef.current === null) prevPageRef.current = initial.page;
  }, [initial.page]);

  // URL -> state (guarded so identical values do not cause extra re-renders while typing)
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      urlInitializedRef.current = true;
      return;
    }

    isSyncingFromUrlRef.current = true;

    const search = searchParams.get('search') || '';
    const aStatus = searchParams.get('agentStatus') || DEFAULT_AGENT_STATUS;
    const lStatus = searchParams.get('loginStatus') || DEFAULT_LOGIN_STATUS;
    const hHeadset = searchParams.get('hasHeadset') || DEFAULT_HAS_HEADSET;
    const proc = searchParams.get('processId') || 'all';

    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_ITEMS_PER_PAGE);

    setSearchTerm((prev) => (prev === search ? prev : search));
    setAgentStatus((prev) => (prev === aStatus ? prev : aStatus));
    setLoginStatus((prev) => (prev === lStatus ? prev : lStatus));
    setHasHeadset((prev) => (prev === hHeadset ? prev : hHeadset));
    setProcessId((prev) => (prev === proc ? prev : proc));
    setCurrentPage((prev) => (prev === page ? prev : page));
    setItemsPerPage((prev) => (prev === perPage ? prev : perPage));

    prevPageRef.current = page;
    queueMicrotask(() => (isSyncingFromUrlRef.current = false));
  }, [searchParams]);

  // state -> URL  (use DEBOUNCED search so URL does not update on every keystroke)
  useEffect(() => {
    if (isSyncingFromUrlRef.current || !urlInitializedRef.current) return;

    const p = new URLSearchParams();

    if (debouncedSearchTerm) p.set('search', debouncedSearchTerm);
    if (agentStatus !== DEFAULT_AGENT_STATUS) p.set('agentStatus', agentStatus);
    if (loginStatus !== DEFAULT_LOGIN_STATUS) p.set('loginStatus', loginStatus);
    if (hasHeadset !== DEFAULT_HAS_HEADSET) p.set('hasHeadset', hasHeadset);
    if (processId !== 'all') p.set('processId', String(processId));

    p.set('page', String(currentPage || 1));
    if (itemsPerPage !== DEFAULT_ITEMS_PER_PAGE) p.set('perPage', String(itemsPerPage));

    const cur = new URLSearchParams(searchParams);
    if (p.toString() !== cur.toString()) {
      const pageChanged = prevPageRef.current !== currentPage;
      const shouldPush = isUserPageChangeRef.current && pageChanged;
      setSearchParams(p, { replace: !shouldPush });

      prevPageRef.current = currentPage;
      isUserPageChangeRef.current = false;
    }
  }, [debouncedSearchTerm, agentStatus, loginStatus, hasHeadset, processId, currentPage, itemsPerPage, setSearchParams, searchParams]);

  // Reset page when filters change
  useEffect(() => {
    const key = `${debouncedSearchTerm}||${agentStatus}||${loginStatus}||${hasHeadset}||${processId}`;
    const changed = lastKeyRef.current !== key;
    if (didFilterOnceRef.current && changed && !isSyncingFromUrlRef.current) {
      isUserPageChangeRef.current = false;
      setCurrentPage(1);
    }
    didFilterOnceRef.current = true;
    lastKeyRef.current = key;
  }, [debouncedSearchTerm, agentStatus, loginStatus, hasHeadset, processId]);

  // Load processes for filter dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await getProcessesForDropdown();
        const arr = res.data?.data || [];
        setProcessOptions([{ id: 'all', name: 'All Processes' }, ...arr.map((p) => ({ id: String(p.id), name: p.name }))]);
      } catch {
        // non-blocking
      }
    })();
  }, []);

  const fetchAgents = async () => {
    const res = await getAllAgents({
      search: debouncedSearchTerm || '',
      status: agentStatus === 'all' ? '' : agentStatus,
      user_is_active: loginStatusToApi(loginStatus),
      has_headset: hasHeadset === 'all' ? '' : hasHeadset,
      process_id: processId === 'all' ? '' : processId,
      page: currentPage,
      limit: itemsPerPage,
      sort_by: 'name',
      sort_order: 'ASC',
    });

    const payload = res.data;
    setAgents(payload?.data || []);
    setTotal(payload?.pagination?.total ?? 0);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setTableMsg({ type: '', text: '' });
        await fetchAgents();
      } catch (e) {
        console.error(e);
        setAgents([]);
        setTotal(0);
        setTableMsg({ type: 'error', text: 'Failed to load agents' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, agentStatus, loginStatus, hasHeadset, processId, currentPage, itemsPerPage]);

  const totalPages = Math.max(1, Math.ceil(total / itemsPerPage));

  useEffect(() => {
    if (currentPage > totalPages && !isSyncingFromUrlRef.current) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // Export
  const hasActiveFilters =
    searchTerm.trim() !== '' ||
    agentStatus !== DEFAULT_AGENT_STATUS ||
    loginStatus !== DEFAULT_LOGIN_STATUS ||
    hasHeadset !== DEFAULT_HAS_HEADSET ||
    processId !== 'all';

  const mapRow = (a) => ({
    'Agent ID': a.id,
    Name: a.name,
    'Employee ID': a.employeeId || '',
    'Agent Status': a.status,
    'Login Active': a.userIsActive ? 'Yes' : 'No',
    Process: a.process?.name || '',
    Manager: a.manager || '',
    'Team Leader': a.teamLeader || '',
    'Has Headset': a.headset ? 'Yes' : 'No',
    'Headset Number': a.headset?.headsetNumber || '',
    'Headset Type': a.headset?.headsetType || '',
    Email: a.email || '',
    Phone: a.phone || '',
    'Joining Date': a.joiningDate || '',
    'Floor Join Date': a.floorJoinDate || '',
  });

  const exportCurrentPage = () => {
    const ws = XLSX.utils.json_to_sheet(agents.map(mapRow));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Page_${currentPage}`);
    XLSX.writeFile(wb, `Agents_Page_${currentPage}.xlsx`);
  };

  const exportAllFiltered = async () => {
    try {
      const MAX_LIMIT = 100;
      let page = 1;
      let collected = [];

      while (true) {
        const res = await getAllAgents({
          search: debouncedSearchTerm || '',
          status: agentStatus === 'all' ? '' : agentStatus,
          user_is_active: loginStatusToApi(loginStatus),
          has_headset: hasHeadset === 'all' ? '' : hasHeadset,
          process_id: processId === 'all' ? '' : processId,
          page,
          limit: MAX_LIMIT,
          sort_by: 'name',
          sort_order: 'ASC',
        });

        const payload = res.data;
        const rows = payload?.data || [];
        collected = collected.concat(rows);

        const t = payload?.pagination?.total ?? collected.length;
        if (collected.length >= t) break;

        page += 1;
        if (page > 200) break;
      }

      const ws = XLSX.utils.json_to_sheet(collected.map(mapRow));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Agents');
      XLSX.writeFile(wb, `Agents_${hasActiveFilters ? 'Filtered' : 'All'}.xlsx`);

      setTableMsg({ type: 'success', text: `Exported ${collected.length} agents.` });
    } catch (e) {
      console.error(e);
      setTableMsg({ type: 'error', text: 'Export failed' });
    }
  };

  return (
    <div className="dash-container">
      <div className="container dash-content">
        <div className="dash-header-card">
          <div className="dash-header-left">
            <h1 className="dash-title">
              <i className="bi bi-people" /> Agents
            </h1>
            <p className="dash-subtitle">Read-only list + De‑Assign action</p>
          </div>

          <div className="dash-date-range">
            <button className="dash-reset-btn" type="button" onClick={() => navigate('/dashboard')}>
              <i className="bi bi-arrow-left" /> Dashboard
            </button>
          </div>
        </div>

        <div className="dash-table-card" ref={tableCardRef}>
          <div className="dash-table-top">
            <div className="dash-table-title">
              <h2>Agents</h2>
              <p>Search + filters + pagination + export</p>
            </div>

            <div className="dash-table-controls">
              <div className="dash-search">
                <i className="bi bi-search" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name / emp id / email / phone..."
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

              <select className="dash-select" value={loginStatus} onChange={(e) => setLoginStatus(e.target.value)}>
                <option value="active">Login Active</option>
                <option value="inactive">Login Inactive</option>
                <option value="all">Login All</option>
              </select>

              <select className="dash-select" value={agentStatus} onChange={(e) => setAgentStatus(e.target.value)}>
                <option value="all">Agent Status: All</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="training">training</option>
                <option value="ojt">ojt</option>
              </select>

              <select className="dash-select" value={hasHeadset} onChange={(e) => setHasHeadset(e.target.value)}>
                <option value="all">Has Headset: All</option>
                <option value="true">Has Headset</option>
                <option value="false">No Headset</option>
              </select>

              <select className="dash-select" value={processId} onChange={(e) => setProcessId(e.target.value)}>
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
                disabled={total === 0}
                title={`Export ${total} rows`}
              >
                <i className="bi bi-download" /> {hasActiveFilters ? 'Export Filtered' : 'Export All'} ({total})
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
                disabled={agents.length === 0}
              >
                <i className="bi bi-file-earmark" /> Export Page
              </button>
            </div>

            <div className="dash-counts">
              Total: <strong>{total}</strong> | Page <strong>{currentPage}</strong> / <strong>{totalPages}</strong>
            </div>
          </div>

          {tableMsg.text && <div className={`dash-table-alert ${tableMsg.type}`}>{tableMsg.text}</div>}

          {loading ? (
            <div className="dash-loading" style={{ padding: 40 }}>
              <div className="dash-spinner" />
              <p>Loading agents...</p>
            </div>
          ) : (
            <>
              <div className="dash-table-wrap">
                <table className="dash-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Name</th>
                      <th>Emp ID</th>
                      <th>Agent Status</th>
                      <th>Login</th>
                      <th>Process</th>
                      <th>Headset</th>
                      <th>Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {agents.map((a) => {
                      const has = !!a.headset;
                      return (
                        <tr key={a.id}>
                          <td>#{a.id}</td>
                          <td>{a.name || '—'}</td>
                          <td>{a.employeeId || '—'}</td>
                          <td>{a.status || '—'}</td>
                          <td>{a.userIsActive ? <span className="dash-pill ok">Active</span> : <span className="dash-pill bad">Inactive</span>}</td>
                          <td>{a.process?.name || '—'}</td>
                          <td>
                            {has ? (
                              <>
                                {a.headset.headsetNumber} <small style={{ opacity: 0.8 }}>({a.headset.headsetType})</small>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="dash-row-btn secondary"
                              disabled={!has}
                              title={!has ? 'No active headset assignment' : 'De‑Assign (return headset + refund request)'}
                              onClick={() => navigate(`/agents/${a.id}/deassign`)}
                            >
                              De‑Assign
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {agents.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>
                          No agents found
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
