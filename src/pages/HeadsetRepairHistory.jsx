import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHeadsetRepairs } from '../services/headsetService';
import './HeadsetRepairHistory.css';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

function isValidPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

export default function HeadsetRepairHistory() {
  const { id } = useParams();
  const headsetId = Number(id);
  const isValidId = isValidPositiveInt(headsetId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  const loadRepairs = useCallback(async () => {
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
      const res = await getHeadsetRepairs(headsetId);
      setRows(res.data?.data?.repairs || []);
    } catch (e) {
      console.error(e);
      setRows([]);
      setErr(e?.response?.data?.message || 'Failed to load repair history');
    } finally {
      setLoading(false);
    }
  }, [headsetId, isValidId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRepairs();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRepairs]);

  return (
    <div className="hrh-container">
      <div className="container hrh-content">
        <div className="hrh-header-card">
          <div className="hrh-header-left">
            <h1 className="hrh-title">
              <i className="bi bi-tools" /> Repair History — Headset #{headsetId || id}
            </h1>
            <p className="hrh-subtitle">All repair lot records for this headset.</p>
          </div>

          <div className="hrh-header-actions">
            <button className="hrh-action-btn secondary" type="button" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left" /> Back
            </button>
            <button className="hrh-action-btn" type="button" onClick={() => navigate('/inventory')}>
              <i className="bi bi-box-seam" /> Inventory
            </button>
            <button
              className="hrh-action-btn"
              type="button"
              disabled={!isValidId}
              onClick={() => navigate(`/headsets/${headsetId}`)}
            >
              <i className="bi bi-headset" /> View Headset
            </button>
          </div>
        </div>

        {loading ? (
          <div className="hrh-state-card">
            <h2>Loading repair history...</h2>
          </div>
        ) : err ? (
          <div className="hrh-state-card">
            <i className="bi bi-exclamation-triangle hrh-state-icon" />
            <h2>Could not load repair history</h2>
            <p>{err}</p>
            <div className="hrh-state-actions">
              <button className="hrh-action-btn" type="button" onClick={loadRepairs}>
                <i className="bi bi-arrow-repeat" /> Retry
              </button>
              <button className="hrh-action-btn secondary" type="button" onClick={() => navigate('/inventory')}>
                <i className="bi bi-box-seam" /> Back to Inventory
              </button>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="hrh-state-card">
            <i className="bi bi-inbox hrh-state-icon" />
            <h2>No repairs found</h2>
            <p>This headset has no repair records yet.</p>
          </div>
        ) : (
          <div className="hrh-card">
            <div className="hrh-card-top">
              <h3>Repair Records ({rows.length})</h3>
            </div>
            <div className="hrh-table-wrap">
              <table className="hrh-table">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Status</th>
                    <th>Vendor</th>
                    <th>Brand Group</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Added</th>
                    <th>Sent</th>
                    <th>Received</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.lotItemId}>
                      <td>{r.lot?.lotCode || `Lot#${r.lot?.id}`}</td>
                      <td>{r.lot?.status || '—'}</td>
                      <td>{r.lot?.vendorName || '—'}</td>
                      <td>{r.lot?.brandGroup || '—'}</td>
                      <td>{r.conditionBefore || '—'}</td>
                      <td>{r.conditionAfter || '—'}</td>
                      <td>{fmtDate(r.addedAt)}</td>
                      <td>{fmtDate(r.itemSentAt)}</td>
                      <td>{fmtDate(r.itemReceivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
