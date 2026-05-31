import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHeadsetById, getHeadsetRepairs } from '../services/headsetService';
import { formatHeadsetType, formatBrandName } from '../utils/headsetFormat';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

export default function HeadsetDetails() {
  const { id } = useParams();
  const headsetId = Number(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [h, setH] = useState(null);
  const [err, setErr] = useState('');

  // ✅ new repairs (repair_lots / repair_lot_items)
  const [repairsLoading, setRepairsLoading] = useState(false);
  const [repairsErr, setRepairsErr] = useState('');
  const [repairs, setRepairs] = useState([]);

  const title = useMemo(
    () => (h?.headsetNumber ? `Headset ${h.headsetNumber}` : `Headset #${headsetId}`),
    [h, headsetId]
  );

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        const res = await getHeadsetById(headsetId);
        setH(res.data?.data || null);
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.message || 'Failed to load headset');
      } finally {
        setLoading(false);
      }
    })();
  }, [headsetId]);

  // ✅ Load repair history from new endpoint
  useEffect(() => {
    (async () => {
      if (!headsetId) return;
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
    })();
  }, [headsetId]);

  if (!headsetId) return <div style={{ padding: 24 }}>Invalid headset id</div>;
  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (err) return <div style={{ padding: 24, color: 'crimson' }}>{err}</div>;
  if (!h) return <div style={{ padding: 24 }}>Headset not found</div>;

  // ✅ your getHeadsetById returns currentAssignment, not assignment
  const assignment = h.currentAssignment;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => navigate(-1)}>← Back</button>
        <button type="button" onClick={() => navigate('/inventory')}>Inventory</button>
        <button type="button" onClick={() => navigate(`/headsets/${h.id}/assignments`)}>Assignment History</button>
        <button type="button" onClick={() => navigate(`/headsets/${h.id}/repairs`)}>Repair History</button>

        {assignment?.id ? (
          <button type="button" onClick={() => navigate(`/assignments/${assignment.id}`)}>
            Current Assignment
          </button>
        ) : null}
      </div>

      <h2 style={{ marginTop: 14 }}>{title}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Headset Info</h3>
          <div><strong>Number:</strong> {h.headsetNumber}</div>
          <div><strong>Type:</strong> {formatHeadsetType(h.headsetType)}</div>
          <div><strong>Brand:</strong> {formatBrandName(h.brand?.name || '')}</div>
          <div><strong>Status:</strong> {h.status}</div>
          <div><strong>Condition:</strong> {h.condition}</div>

          <div style={{ marginTop: 10 }}>
            <strong>Tier:</strong>{' '}
            Deposit <strong>{Number(h.tier?.depositAmount || 0)}</strong> | Refund{' '}
            <strong>{Number(h.tier?.refundAmount || 0)}</strong>
          </div>

          <div style={{ marginTop: 10 }}>
            <strong>Purchase Date:</strong> {fmtDate(h.purchaseDate)}
          </div>
          <div>
            <strong>Warranty Expiry:</strong> {fmtDate(h.warrantyExpiry)}
          </div>

          <div style={{ marginTop: 10 }}>
            <strong>Notes:</strong>
            <div style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>{h.notes || '—'}</div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Current Assignment</h3>
          {assignment ? (
            <>
              <div><strong>Assignment ID:</strong> {assignment.id}</div>

              {/* Optional: show assignment kind if you add it to API */}
              {assignment.assignmentKind ? (
                <div><strong>Kind:</strong> {assignment.assignmentKind}</div>
              ) : null}

              <div><strong>Assigned At:</strong> {fmtDate(assignment.assignmentDate)}</div>

              <div><strong>Agent:</strong> {assignment.agent?.name || '—'}</div>
              <div><strong>Employee ID:</strong> {assignment.agent?.employeeId || '—'}</div>

              {/* ✅ In getHeadsetById, process is object {name, category} */}
              <div><strong>Process:</strong> {assignment.process?.name || '—'}</div>
              <div><strong>Category:</strong> {assignment.process?.category || '—'}</div>

              <div style={{ marginTop: 12 }}>
                <button type="button" onClick={() => navigate(`/assignments/${assignment.id}`)}>
                  View Assignment Details
                </button>
              </div>
            </>
          ) : (
            <div>Not assigned</div>
          )}
        </div>
      </div>

      {/* ✅ New Repair History Preview (from repair_lots/repair_lot_items) */}
      <div style={{ marginTop: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Latest Repairs (New Flow)</h3>
          <button type="button" onClick={() => navigate(`/headsets/${h.id}/repairs`)}>
            View Full Repair History
          </button>
        </div>

        {repairsLoading ? (
          <div style={{ marginTop: 10 }}>Loading repair history…</div>
        ) : repairsErr ? (
          <div style={{ marginTop: 10, color: 'crimson' }}>{repairsErr}</div>
        ) : repairs.length === 0 ? (
          <div style={{ marginTop: 10 }}>—</div>
        ) : (
          <div style={{ marginTop: 10, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ padding: 10, textAlign: 'left' }}>Lot</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Status</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Vendor</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Before</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>After</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Added</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Sent</th>
                  <th style={{ padding: 10, textAlign: 'left' }}>Received</th>
                </tr>
              </thead>
              <tbody>
                {repairs.slice(0, 5).map((r) => (
                  <tr key={r.lotItemId} style={{ borderTop: '1px solid #e5e7eb' }}>
                    <td style={{ padding: 10 }}>{r.lot?.lotCode || `Lot#${r.lot?.id}`}</td>
                    <td style={{ padding: 10 }}>{r.lot?.status || '—'}</td>
                    <td style={{ padding: 10 }}>{r.lot?.vendorName || '—'}</td>
                    <td style={{ padding: 10 }}>{r.conditionBefore || '—'}</td>
                    <td style={{ padding: 10 }}>{r.conditionAfter || '—'}</td>
                    <td style={{ padding: 10 }}>{fmtDate(r.addedAt)}</td>
                    <td style={{ padding: 10 }}>{fmtDate(r.itemSentAt)}</td>
                    <td style={{ padding: 10 }}>{fmtDate(r.itemReceivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {repairs.length > 5 ? (
              <div style={{ marginTop: 10, opacity: 0.8 }}>
                Showing latest 5 of {repairs.length}.
              </div>
            ) : null}
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
        <h3 style={{ marginTop: 0 }}>Images</h3>
        {h.images?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {h.images.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" title="Open image">
                <img
                  src={url}
                  alt="Headset"
                  style={{ width: 220, height: 140, objectFit: 'cover', borderRadius: 10, border: '1px solid #e5e7eb' }}
                />
              </a>
            ))}
          </div>
        ) : (
          <div>—</div>
        )}
      </div>
    </div>
  );
}