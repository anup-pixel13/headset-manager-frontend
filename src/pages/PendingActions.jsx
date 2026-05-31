import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { getPendingSignatures, getPendingPermanentIds } from '../services/assignmentService';
import { updateEmployeeId } from '../services/agentService';
import { useAuth } from '../auth/AuthContext';

import './PendingActions.css';

export default function PendingActions() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, loading: authLoading } = useAuth();
  const initialTab = searchParams.get('tab') === 'ids' ? 'ids' : 'signatures';
  const [tab, setTab] = useState(initialTab); // 'signatures' | 'ids'

  const [loading, setLoading] = useState(true);

  const [pendingSigs, setPendingSigs] = useState([]);
  const [pendingIds, setPendingIds] = useState([]);

  const [message, setMessage] = useState({ type: '', text: '' });

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [newEmpId, setNewEmpId] = useState('');

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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', tab);
    if (p.toString() !== searchParams.toString()) setSearchParams(p, { replace: true });
  }, [tab, searchParams, setSearchParams]);

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

  return (
    <div className="pa-container">
      <div className="container pa-content">
        <div className="pa-top">
          <h2 className="pa-title">Pending Actions</h2>
          <div className="pa-actions">
            <button className="pa-btn" onClick={load} type="button">
              Refresh
            </button>
            <button className="pa-btn secondary" onClick={() => navigate('/dashboard')} type="button">
              Back
            </button>
          </div>
        </div>

        {message.text && <div className={`pa-alert ${message.type}`}>{message.text}</div>}

        <div className="pa-tabs">
          <button
            className={`pa-tab ${tab === 'signatures' ? 'active' : ''}`}
            onClick={() => setTab('signatures')}
            type="button"
          >
            Pending Signatures ({pendingSigs.length})
          </button>
          <button
            className={`pa-tab ${tab === 'ids' ? 'active' : ''}`}
            onClick={() => setTab('ids')}
            type="button"
          >
            Pending Permanent IDs ({pendingIds.length})
          </button>
        </div>

        {loading ? (
          <div className="pa-card">Loading...</div>
        ) : tab === 'signatures' ? (
          <div className="pa-card">
            <div style={{ marginBottom: 10, fontWeight: 800, color: '#374151' }}>
              Required signatures: <b>Agent</b> + <b>Admin Executive</b> + <b>IT Staff</b> + (<b>Manager</b> OR <b>TL</b>)
            </div>

            {pendingSigs.length === 0 ? (
              <div>No pending signatures.</div>
            ) : (
              <table className="pa-table">
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
                  {pendingSigs.map((a) => (
                    <tr key={`ps-${a.id}`}>
                      <td>{a.id}</td>
                      <td>{a.agentName}</td>
                      <td>{a.employeeId}</td>
                      <td>{a.headsetNumber}</td>
                      <td>{a.tlName}</td>
                      <td>{a.managerName}</td>
                      <td>{missingLabel(a.missing)}</td>
                      <td>
                        <button className="pa-btn small" onClick={() => goCollect(a.id)} type="button">
                          Collect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="pa-card">
            <div style={{ marginBottom: 10, fontWeight: 800, color: '#374151' }}>
              Deposit PDF remains locked until permanent ID is updated to <b>AIPL####</b> and all signatures are collected.
            </div>

            {pendingIds.length === 0 ? (
              <div>No pending permanent IDs.</div>
            ) : (
              <table className="pa-table">
                <thead>
                  <tr>
                    <th>Assignment ID</th>
                    <th>Agent</th>
                    <th>Temp ID</th>
                    <th>Headset</th>
                    <th>Process</th>
                    <th>TL</th>
                    <th>Manager</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingIds.map((r) => (
                    <tr key={`pid-${r.assignmentId}-${r.userId || 'nouser'}`}>
                      <td>{r.assignmentId}</td>
                      <td>{r.agentName}</td>
                      <td>{r.tempEmployeeId || '—'}</td>
                      <td>
                        {r.headsetNumber} {r.headsetType ? `(${r.headsetType})` : ''}
                      </td>
                      <td>{r.process || '—'}</td>
                      <td>{r.tlName || '—'}</td>
                      <td>{r.managerName || '—'}</td>
                      <td>
                        <button className="pa-btn small" onClick={() => openUpdateModal(r)} type="button">
                          Update ID
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {showModal && (
              <div className="pa-modal-backdrop" onClick={closeModal}>
                <div className="pa-modal" onClick={(e) => e.stopPropagation()}>
                  <h3 className="pa-modal-title">Update Permanent Employee ID</h3>

                  <div className="pa-modal-meta">
                    <div><b>Agent:</b> {selected?.agentName}</div>
                    <div><b>Temp ID:</b> {selected?.tempEmployeeId || '—'}</div>
                    <div><b>Assignment ID:</b> {selected?.assignmentId}</div>
                    <div><b>Headset:</b> {selected?.headsetNumber} ({selected?.headsetType})</div>
                    <div><b>Process:</b> {selected?.process || '—'}</div>
                  </div>

                  {/* ✅ New warning */}
                  {modalCurrentId && !modalCurrentIdIsPermanent && (
                    <div className="pa-alert warn" style={{ marginTop: 10 }}>
                      Current ID "<b>{modalCurrentId}</b>" is not a valid permanent ID. Please correct it to <b>AIPL####</b> (4–5 digits).
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
                    <button className="pa-btn secondary" onClick={closeModal} type="button" disabled={saving}>
                      Cancel
                    </button>
                    <button className="pa-btn" onClick={saveEmployeeId} type="button" disabled={saving}>
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