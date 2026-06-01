import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';

import SmartPagination from '../components/SmartPagination';
import { getYJacks, assignYJack, unassignYJack } from '../services/yJackService';
import './YJacks.css';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const PER_PAGE_OPTIONS = [10, 20, 30, 50, 100];

function toPositiveInt(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export default function YJacks() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tableCardRef = useRef(null);

  const initial = useMemo(() => {
    const search = searchParams.get('search') || '';
    const page = toPositiveInt(searchParams.get('page'), DEFAULT_PAGE);
    const perPage = toPositiveInt(searchParams.get('perPage'), DEFAULT_PER_PAGE);
    return { search, page, perPage };
  }, [searchParams]);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState(initial.search);

  const [page, setPage] = useState(initial.page);
  const [perPage, setPerPage] = useState(initial.perPage);

  const [message, setMessage] = useState({ type: '', text: '' });

  // assign modal state
  const [showAssign, setShowAssign] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedHeadsetId, setSelectedHeadsetId] = useState(null);
  const [trainerName, setTrainerName] = useState('');
  const [notes, setNotes] = useState('');

  // keep URL in sync
  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    p.set('page', String(page));
    if (perPage !== DEFAULT_PER_PAGE) p.set('perPage', String(perPage));
    setSearchParams(p, { replace: true });
  }, [search, page, perPage, setSearchParams]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const load = async () => {
    try {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const res = await getYJacks({ search, page, limit: perPage });

      const payload = res.data;
      setRows(payload?.data || []);
      setTotal(payload?.pagination?.total ?? 0);
    } catch (e) {
      console.error(e);
      setRows([]);
      setTotal(0);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load Y-Jacks.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [search, page, perPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const openAssignModal = (headsetId) => {
    setSelectedHeadsetId(headsetId);
    setTrainerName('');
    setNotes('');
    setShowAssign(true);
    setMessage({ type: '', text: '' });
  };

  const closeAssignModal = () => {
    setShowAssign(false);
    setSelectedHeadsetId(null);
    setTrainerName('');
    setNotes('');
    setAssigning(false);
  };

  const submitAssign = async () => {
    const cleanTrainer = trainerName.trim();
    if (!selectedHeadsetId) return;
    if (!cleanTrainer) {
      setMessage({ type: 'error', text: 'Trainer name is required.' });
      return;
    }

    try {
      setAssigning(true);
      setMessage({ type: '', text: '' });
      await assignYJack({ headset_id: selectedHeadsetId, trainer_name: cleanTrainer, notes });
      closeAssignModal();
      setMessage({ type: 'success', text: 'Y-Jack assigned successfully.' });
      await load();
    } catch (e) {
      console.error(e);
      setAssigning(false);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'Assign failed.' });
    }
  };

  const doUnassign = async (headsetId) => {
    if (!headsetId) return;
    const ok = window.confirm('De-assign this Y-Jack?');
    if (!ok) return;

    try {
      setMessage({ type: '', text: '' });
      await unassignYJack({ headset_id: headsetId, notes: '' });
      setMessage({ type: 'success', text: 'Y-Jack de-assigned successfully.' });
      await load();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || 'De-assign failed.' });
    }
  };

  const exportCurrentPage = () => {
    const excelData = rows.map((r) => ({
      'Y-Jack Number': r.yjackNumber,
      'Trainer Name': r.trainerName || '',
      'Assigned At': r.assignedAt ? new Date(r.assignedAt).toLocaleString() : '',
      'Unassigned At': r.unassignedAt ? new Date(r.unassignedAt).toLocaleString() : '',
      Active: r.isActive ? 'Yes' : 'No',
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Page_${page}`);
    XLSX.writeFile(wb, `YJacks_Page_${page}.xlsx`);
  };

  const exportAllFiltered = async () => {
    try {
      const MAX_LIMIT = 100;
      let p = 1;
      let collected = [];

      while (true) {
        const res = await getYJacks({ search, page: p, limit: MAX_LIMIT });
        const payload = res.data;
        const chunk = payload?.data || [];
        collected = collected.concat(chunk);

        const t = payload?.pagination?.total ?? collected.length;
        if (collected.length >= t) break;

        p += 1;
        if (p > 200) break;
      }

      const excelData = collected.map((r) => ({
        'Y-Jack Number': r.yjackNumber,
        'Trainer Name': r.trainerName || '',
        'Assigned At': r.assignedAt ? new Date(r.assignedAt).toLocaleString() : '',
        'Unassigned At': r.unassignedAt ? new Date(r.unassignedAt).toLocaleString() : '',
        Active: r.isActive ? 'Yes' : 'No',
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'YJacks');
      XLSX.writeFile(wb, `YJacks_${search ? 'Filtered' : 'All'}.xlsx`);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Export failed.' });
    }
  };

  return (
    <div className="yjack-container">
      <div className="container yjack-content">
        <div className="yjack-top">
          <h2 className="yjack-title">Y-Jack Assignments</h2>
          <div className="yjack-actions">
            <button className="yjack-btn secondary" onClick={() => navigate('/dashboard')} type="button">
              Back
            </button>
            <button className="yjack-btn" onClick={load} type="button">
              Refresh
            </button>
          </div>
        </div>

        {message.text && <div className={`yjack-alert ${message.type}`}>{message.text}</div>}

        <div className="yjack-controls">
          <div className="yjack-search">
            <i className="bi bi-search" />
            <input
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              placeholder="Search Y number or trainer..."
            />
          </div>

          <select
            className="yjack-select"
            value={perPage}
            onChange={(e) => {
              setPage(1);
              setPerPage(toPositiveInt(e.target.value, DEFAULT_PER_PAGE));
            }}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>

          <button className="yjack-btn" type="button" onClick={exportCurrentPage} disabled={rows.length === 0}>
            Export Page
          </button>
          <button className="yjack-btn" type="button" onClick={exportAllFiltered} disabled={total === 0}>
            Export All ({total})
          </button>
        </div>

        {loading ? (
          <div className="yjack-card">Loading...</div>
        ) : (
          <div className="yjack-card" ref={tableCardRef}>
            <div className="yjack-meta">
              Total: <b>{total}</b> | Page <b>{page}</b> / <b>{totalPages}</b>
            </div>

            <div className="yjack-table-wrap">
              <table className="yjack-table">
                <thead>
                  <tr>
                    <th>Y-Jack</th>
                    <th>Trainer</th>
                    <th>Assigned</th>
                    <th>De-assigned</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.headsetId}>
                      <td>{r.yjackNumber}</td>
                      <td>{r.trainerName || '—'}</td>
                      <td>{r.assignedAt ? new Date(r.assignedAt).toLocaleString() : '—'}</td>
                      <td>{r.unassignedAt ? new Date(r.unassignedAt).toLocaleString() : '—'}</td>
                      <td>{r.isActive ? 'Assigned' : 'Available'}</td>
                      <td>
                        {r.isActive ? (
                          <button className="yjack-btn small secondary" type="button" onClick={() => doUnassign(r.headsetId)}>
                            De-assign
                          </button>
                        ) : (
                          <button className="yjack-btn small" type="button" onClick={() => openAssignModal(r.headsetId)}>
                            Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}

                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>
                        No Y-Jacks found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
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
                className="yjack-pagination"
              />
            )}
          </div>
        )}

        {showAssign && (
          <div className="yjack-modal-backdrop" onClick={closeAssignModal}>
            <div className="yjack-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="yjack-modal-title">Assign Y-Jack</h3>

              <label className="yjack-label">Trainer Name *</label>
              <input
                className="yjack-input"
                value={trainerName}
                onChange={(e) => setTrainerName(e.target.value)}
                placeholder="e.g. Trainer Rahul"
              />

              <label className="yjack-label">Notes</label>
              <textarea className="yjack-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

              <div className="yjack-modal-actions">
                <button className="yjack-btn secondary" type="button" onClick={closeAssignModal} disabled={assigning}>
                  Cancel
                </button>
                <button className="yjack-btn" type="button" onClick={submitAssign} disabled={assigning}>
                  {assigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}