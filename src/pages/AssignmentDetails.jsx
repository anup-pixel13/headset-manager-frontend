import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAssignmentById } from '../services/assignmentService';
import { formatHeadsetType, formatBrandName } from '../utils/headsetFormat';
import './AssignmentDetails.css';

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

export default function AssignmentDetails() {
  const { id } = useParams();
  const assignmentId = Number(id);
  const isValidId = isValidPositiveInt(assignmentId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');

  const loadAssignment = useCallback(async () => {
    await Promise.resolve();

    if (!isValidId) {
      setLoading(false);
      setA(null);
      setErr('Invalid assignment id in URL.');
      return;
    }

    try {
      setLoading(true);
      setErr('');
      const res = await getAssignmentById(assignmentId);
      setA(res.data?.data || null);
    } catch (e) {
      console.error(e);
      setA(null);
      setErr(e?.response?.data?.message || 'Failed to load assignment');
    } finally {
      setLoading(false);
    }
  }, [assignmentId, isValidId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAssignment();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadAssignment]);

  const kindMeta = useMemo(() => assignmentKindMeta(a?.assignmentKind), [a?.assignmentKind]);

  return (
    <div className="ad-container">
      <div className="container ad-content">
        <div className="ad-header-card">
          <div className="ad-header-left">
            <h1 className="ad-title">
              <i className="bi bi-person-lines-fill" /> Assignment #{assignmentId || id}
            </h1>
            <p className="ad-subtitle">
              {a?.agent?.name ? `${a.agent.name} • ${a.headset?.number || 'Headset —'} • ${a.process?.name || 'Process —'}` : 'Loading assignment details...'}
            </p>
          </div>

          <div className="ad-header-actions">
            <button className="ad-action-btn secondary" type="button" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left" /> Back
            </button>
            <button className="ad-action-btn" type="button" onClick={() => navigate('/inventory')}>
              <i className="bi bi-box-seam" /> Inventory
            </button>
            {a?.headset?.id ? (
              <button className="ad-action-btn" type="button" onClick={() => navigate(`/headsets/${a.headset.id}`)}>
                <i className="bi bi-headset" /> View Headset
              </button>
            ) : null}
            {a?.headset?.id ? (
              <button className="ad-action-btn" type="button" onClick={() => navigate(`/headsets/${a.headset.id}/assignments`)}>
                <i className="bi bi-clock-history" /> Assignment History
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="ad-state-card">
            <h2>Loading assignment details...</h2>
          </div>
        ) : err ? (
          <div className="ad-state-card">
            <i className="bi bi-exclamation-triangle ad-state-icon" />
            <h2>Could not load assignment</h2>
            <p>{err}</p>
            <div className="ad-state-actions">
              <button className="ad-action-btn" type="button" onClick={loadAssignment}>
                <i className="bi bi-arrow-repeat" /> Retry
              </button>
              <button className="ad-action-btn secondary" type="button" onClick={() => navigate('/inventory')}>
                <i className="bi bi-box-seam" /> Back to Inventory
              </button>
            </div>
          </div>
        ) : !a ? (
          <div className="ad-state-card">
            <i className="bi bi-inbox ad-state-icon" />
            <h2>Assignment not found</h2>
            <p>No assignment details are available for this ID.</p>
          </div>
        ) : (
          <div className="ad-grid">
            <div className="ad-card">
              <div className="ad-section">
                <h3>Assignment</h3>
                <div className="ad-fields">
                  <div>
                    <span className="ad-field-label">Status:</span>{' '}
                    <span className={`ad-pill ${a.isActive ? 'ok' : 'bad'}`}>{a.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div>
                    <span className="ad-field-label">Verification:</span>{' '}
                    <span className={`ad-pill ${a.isVerified ? 'ok' : 'warn'}`}>{a.isVerified ? 'Verified' : 'Pending'}</span>
                  </div>
                  <div>
                    <span className="ad-field-label">Kind:</span> <span className={`ad-pill ${kindMeta.tone}`}>{kindMeta.label}</span>
                  </div>
                  <div><span className="ad-field-label">Assigned:</span> {fmtDate(a.assignmentDate)}</div>
                  <div><span className="ad-field-label">Returned:</span> {fmtDate(a.returnDate)}</div>
                  <div><span className="ad-field-label">Return Condition:</span> {a.returnCondition || '—'}</div>
                  <div>
                    <span className="ad-field-label">Notes:</span>
                    <div className="ad-notes">{a.notes || '—'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="ad-card">
              <div className="ad-section">
                <h3>Agent</h3>
                <div className="ad-fields">
                  <div><span className="ad-field-label">Name:</span> {a.agent?.name || '—'}</div>
                  <div><span className="ad-field-label">Employee ID:</span> {a.agent?.employeeId || '—'}</div>
                  <div><span className="ad-field-label">Manager:</span> {a.agent?.manager || '—'}</div>
                  <div><span className="ad-field-label">Team Leader:</span> {a.agent?.teamLeader || '—'}</div>
                </div>
              </div>

              <div className="ad-section">
                <h3>Headset</h3>
                <div className="ad-fields">
                  <div><span className="ad-field-label">Number:</span> {a.headset?.number || '—'}</div>
                  <div><span className="ad-field-label">Type:</span> {formatHeadsetType(a.headset?.type)}</div>
                  <div><span className="ad-field-label">Brand:</span> {formatBrandName(a.headset?.brand || '') || '—'}</div>
                  <div><span className="ad-field-label">Condition:</span> {a.headset?.condition || '—'}</div>
                </div>
              </div>

              <div className="ad-section">
                <h3>Process</h3>
                <div className="ad-fields">
                  <div><span className="ad-field-label">Name:</span> {a.process?.name || '—'}</div>
                  <div><span className="ad-field-label">Category:</span> {a.process?.category || '—'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
