import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHeadsetAssignments } from '../services/headsetService';
import './HeadsetAssignmentHistory.css';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

function isValidPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function assignmentKindMeta(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'temp_replacement') return { label: 'TEMP', tone: 'warn' };
  if (k === 'permanent') return { label: 'PERM', tone: 'ok' };
  return { label: kind || '—', tone: 'info' };
}

export default function HeadsetAssignmentHistory() {
  const { id } = useParams();
  const headsetId = Number(id);
  const isValidId = isValidPositiveInt(headsetId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  const loadAssignments = useCallback(async () => {
    await Promise.resolve();

    if (!isValidId) {
      setLoading(false);
      setRows([]);
      setErr('Invalid headset id in URL.');
      return;
    }

    try {
      setLoading(true);
      setErr('');
      const res = await getHeadsetAssignments(headsetId);
      setRows(res.data?.data?.assignments || []);
    } catch (e) {
      console.error(e);
      setRows([]);
      setErr(e?.response?.data?.message || 'Failed to load assignment history');
    } finally {
      setLoading(false);
    }
  }, [headsetId, isValidId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAssignments();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAssignments]);

  return (
    <div className="hah-container">
      <div className="container hah-content">
        <div className="hah-header-card">
          <div className="hah-header-left">
            <h1 className="hah-title">
              <i className="bi bi-clock-history" /> Assignment History — Headset #{headsetId || id}
            </h1>
            <p className="hah-subtitle">Complete assignment timeline for this headset.</p>
          </div>

          <div className="hah-header-actions">
            <button className="hah-action-btn secondary" type="button" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left" /> Back
            </button>
            <button className="hah-action-btn" type="button" onClick={() => navigate('/inventory')}>
              <i className="bi bi-box-seam" /> Inventory
            </button>
            <button
              className="hah-action-btn"
              type="button"
              disabled={!isValidId}
              onClick={() => navigate(`/headsets/${headsetId}`)}
            >
              <i className="bi bi-headset" /> View Headset
            </button>
          </div>
        </div>

        {loading ? (
          <div className="hah-state-card">
            <h2>Loading assignment history...</h2>
          </div>
        ) : err ? (
          <div className="hah-state-card">
            <i className="bi bi-exclamation-triangle hah-state-icon" />
            <h2>Could not load assignment history</h2>
            <p>{err}</p>
            <div className="hah-state-actions">
              <button className="hah-action-btn" type="button" onClick={loadAssignments}>
                <i className="bi bi-arrow-repeat" /> Retry
              </button>
              <button className="hah-action-btn secondary" type="button" onClick={() => navigate('/inventory')}>
                <i className="bi bi-box-seam" /> Back to Inventory
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="hah-state-card">
            <i className="bi bi-inbox hah-state-icon" />
            <h2>No assignments found</h2>
            <p>This headset has no assignment records yet.</p>
          </div>
        ) : (
          <div className="hah-card">
            <div className="hah-card-top">
              <h3>Assignments ({rows.length})</h3>
            </div>
            <div className="hah-table-wrap">
              <table className="hah-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Kind</th>
                    <th>Agent</th>
                    <th>Process</th>
                    <th>Assigned</th>
                    <th>Returned</th>
                    <th>Return Cond</th>
                    <th>Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => {
                    const kind = assignmentKindMeta(a.assignmentKind || 'permanent');
                    return (
                      <tr key={a.id}>
                        <td>#{a.id}</td>
                        <td>
                          <span className={`hah-pill ${kind.tone}`}>{kind.label}</span>
                        </td>
                        <td>
                          {a.agent?.name || '—'} ({a.agent?.employeeId || '—'})
                        </td>
                        <td>{a.process?.name || '—'}</td>
                        <td>{fmtDate(a.assignmentDate)}</td>
                        <td>{fmtDate(a.returnDate)}</td>
                        <td>{a.returnCondition || '—'}</td>
                        <td>
                          <span className={`hah-pill ${a.isActive ? 'ok' : 'bad'}`}>{a.isActive ? 'Yes' : 'No'}</span>
                        </td>
                        <td>
                          <button className="hah-action-btn secondary" type="button" onClick={() => navigate(`/assignments/${a.id}`)}>
                            <i className="bi bi-eye" /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
