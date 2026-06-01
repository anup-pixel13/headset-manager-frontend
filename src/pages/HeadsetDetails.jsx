import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHeadsetById, getHeadsetRepairs } from '../services/headsetService';
import { formatHeadsetType, formatBrandName } from '../utils/headsetFormat';
import './HeadsetDetails.css';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

function isValidPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function getHeadsetStatusMeta(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'available') return { label: 'Available', tone: 'ok' };
  if (s === 'assigned') return { label: 'Assigned', tone: 'info' };
  if (s === 'repair') return { label: 'Repair', tone: 'warn' };
  if (s === 'damaged' || s === 'lost') return { label: s.charAt(0).toUpperCase() + s.slice(1), tone: 'bad' };
  if (s === 'retired') return { label: 'Retired', tone: 'neutral' };
  return { label: status || 'Unknown', tone: 'neutral' };
}

function getAssignmentKindMeta(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'temp_replacement') return { label: 'TEMP', tone: 'warn' };
  if (k === 'permanent') return { label: 'PERM', tone: 'ok' };
  return { label: kind || '—', tone: 'neutral' };
}

export default function HeadsetDetails() {
  const { id } = useParams();
  const headsetId = Number(id);
  const isValidId = isValidPositiveInt(headsetId);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [h, setH] = useState(null);
  const [err, setErr] = useState('');

  const [repairsLoading, setRepairsLoading] = useState(false);
  const [repairsErr, setRepairsErr] = useState('');
  const [repairs, setRepairs] = useState([]);

  const title = useMemo(() => (h?.headsetNumber ? `Headset ${h.headsetNumber}` : `Headset #${headsetId || id}`), [h, headsetId, id]);
  const assignment = h?.currentAssignment;

  const loadHeadset = useCallback(async () => {
    await Promise.resolve();

    if (!isValidId) {
      setLoading(false);
      setH(null);
      setErr('Invalid headset id in URL.');
      return;
    }

    try {
      setLoading(true);
      setErr('');
      const res = await getHeadsetById(headsetId);
      setH(res.data?.data || null);
    } catch (e) {
      console.error(e);
      setErr(e?.response?.data?.message || 'Failed to load headset');
      setH(null);
    } finally {
      setLoading(false);
    }
  }, [headsetId, isValidId]);

  const loadRepairs = useCallback(async () => {
    await Promise.resolve();

    if (!isValidId) {
      setRepairs([]);
      setRepairsErr('');
      return;
    }

    try {
      setRepairsLoading(true);
      setRepairsErr('');
      const res = await getHeadsetRepairs(headsetId);
      setRepairs(res.data?.data?.repairs || []);
    } catch (e) {
      console.error(e);
      setRepairsErr(e?.response?.data?.message || 'Failed to load repair history');
      setRepairs([]);
    } finally {
      setRepairsLoading(false);
    }
  }, [headsetId, isValidId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHeadset();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadHeadset]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadRepairs();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRepairs]);

  const subtitleParts = [
    formatHeadsetType(h?.headsetType),
    formatBrandName(h?.brand?.name || ''),
    getHeadsetStatusMeta(h?.status).label,
  ].filter(Boolean);

  return (
    <div className="hd-container">
      <div className="container hd-content">
        <div className="hd-header-card">
          <div className="hd-header-left">
            <h1 className="hd-title">
              <i className="bi bi-headset" /> {title}
            </h1>
            <p className="hd-subtitle">{subtitleParts.length ? subtitleParts.join(' • ') : 'Loading headset details...'}</p>
          </div>

          <div className="hd-header-actions">
            <button className="hd-action-btn secondary" type="button" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left" /> Back
            </button>
            <button className="hd-action-btn" type="button" onClick={() => navigate('/inventory')}>
              <i className="bi bi-box-seam" /> Inventory
            </button>
            <button
              className="hd-action-btn"
              type="button"
              disabled={!h?.id}
              onClick={() => h?.id && navigate(`/headsets/${h.id}/assignments`)}
            >
              <i className="bi bi-clock-history" /> Assignment History
            </button>
            <button
              className="hd-action-btn"
              type="button"
              disabled={!h?.id}
              onClick={() => h?.id && navigate(`/headsets/${h.id}/repairs`)}
            >
              <i className="bi bi-tools" /> Repair History
            </button>
            {assignment?.id ? (
              <button className="hd-action-btn alt" type="button" onClick={() => navigate(`/assignments/${assignment.id}`)}>
                <i className="bi bi-person-lines-fill" /> Current Assignment
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="hd-state-card">
            <h2>Loading headset details...</h2>
          </div>
        ) : err ? (
          <div className="hd-state-card">
            <i className="bi bi-exclamation-triangle hd-state-icon" />
            <h2>Could not load headset</h2>
            <p>{err}</p>
            <div className="hd-state-actions">
              <button className="hd-action-btn" type="button" onClick={() => { loadHeadset(); loadRepairs(); }}>
                <i className="bi bi-arrow-repeat" /> Retry
              </button>
              <button className="hd-action-btn secondary" type="button" onClick={() => navigate('/inventory')}>
                <i className="bi bi-box-seam" /> Back to Inventory
              </button>
            </div>
          </div>
        ) : !h ? (
          <div className="hd-state-card">
            <i className="bi bi-inbox hd-state-icon" />
            <h2>Headset not found</h2>
            <p>No headset details are available for this ID.</p>
          </div>
        ) : (
          <>
            <div className="hd-grid">
              <div className="hd-card">
                <h3>Headset Info</h3>
                <div className="hd-fields">
                  <div><span className="hd-field-label">Number:</span> {h.headsetNumber || '—'}</div>
                  <div><span className="hd-field-label">Type:</span> {formatHeadsetType(h.headsetType)}</div>
                  <div><span className="hd-field-label">Brand:</span> {formatBrandName(h.brand?.name || '') || '—'}</div>
                  <div>
                    <span className="hd-field-label">Status:</span>{' '}
                    {(() => {
                      const meta = getHeadsetStatusMeta(h.status);
                      return <span className={`hd-pill ${meta.tone}`}>{meta.label}</span>;
                    })()}
                  </div>
                  <div><span className="hd-field-label">Condition:</span> {h.condition || '—'}</div>
                  <div>
                    <span className="hd-field-label">Tier:</span> Deposit <strong>{Number(h.tier?.depositAmount || 0)}</strong> | Refund{' '}
                    <strong>{Number(h.tier?.refundAmount || 0)}</strong>
                  </div>
                  <div><span className="hd-field-label">Purchase Date:</span> {fmtDate(h.purchaseDate)}</div>
                  <div><span className="hd-field-label">Warranty Expiry:</span> {fmtDate(h.warrantyExpiry)}</div>
                  <div>
                    <span className="hd-field-label">Notes:</span>
                    <div className="hd-notes">{h.notes || '—'}</div>
                  </div>
                </div>
              </div>

              <div className="hd-card">
                <h3>Current Assignment</h3>
                {assignment ? (
                  <div className="hd-fields">
                    <div><span className="hd-field-label">Assignment ID:</span> #{assignment.id}</div>
                    <div>
                      <span className="hd-field-label">Kind:</span>{' '}
                      {(() => {
                        const meta = getAssignmentKindMeta(assignment.assignmentKind);
                        return <span className={`hd-pill ${meta.tone}`}>{meta.label}</span>;
                      })()}
                    </div>
                    <div><span className="hd-field-label">Assigned At:</span> {fmtDate(assignment.assignmentDate)}</div>
                    <div><span className="hd-field-label">Agent:</span> {assignment.agent?.name || '—'}</div>
                    <div><span className="hd-field-label">Employee ID:</span> {assignment.agent?.employeeId || '—'}</div>
                    <div><span className="hd-field-label">Process:</span> {assignment.process?.name || '—'}</div>
                    <div><span className="hd-field-label">Category:</span> {assignment.process?.category || '—'}</div>
                    <div>
                      <button className="hd-action-btn" type="button" onClick={() => navigate(`/assignments/${assignment.id}`)}>
                        <i className="bi bi-eye" /> View Assignment Details
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="hd-empty">Not currently assigned</div>
                )}
              </div>
            </div>

            <div className="hd-card">
              <div className="hd-card-top">
                <h3>Latest Repairs</h3>
                <button className="hd-action-btn secondary" type="button" onClick={() => navigate(`/headsets/${h.id}/repairs`)}>
                  <i className="bi bi-clock-history" /> View Full Repair History
                </button>
              </div>

              {repairsLoading ? (
                <div className="hd-empty">Loading repair history...</div>
              ) : repairsErr ? (
                <div className="hd-empty">{repairsErr}</div>
              ) : repairs.length === 0 ? (
                <div className="hd-empty">No repair records found.</div>
              ) : (
                <>
                  <div className="hd-table-wrap">
                    <table className="hd-table">
                      <thead>
                        <tr>
                          <th>Lot</th>
                          <th>Status</th>
                          <th>Vendor</th>
                          <th>Before</th>
                          <th>After</th>
                          <th>Added</th>
                          <th>Sent</th>
                          <th>Received</th>
                        </tr>
                      </thead>
                      <tbody>
                        {repairs.slice(0, 5).map((r) => (
                          <tr key={r.lotItemId}>
                            <td>{r.lot?.lotCode || `Lot#${r.lot?.id}`}</td>
                            <td>{r.lot?.status || '—'}</td>
                            <td>{r.lot?.vendorName || '—'}</td>
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
                  {repairs.length > 5 ? <div className="hd-table-note">Showing latest 5 of {repairs.length} repair records.</div> : null}
                </>
              )}
            </div>

            <div className="hd-card">
              <h3>Images</h3>
              {h.images?.length ? (
                <div className="hd-images-grid">
                  {h.images.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" title="Open image in new tab">
                      <img src={url} alt="Headset" className="hd-image" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="hd-empty">No images available.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
