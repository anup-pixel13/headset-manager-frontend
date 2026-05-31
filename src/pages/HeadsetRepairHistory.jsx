import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHeadsetRepairs } from '../services/headsetService';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

export default function HeadsetRepairHistory() {
  const { id } = useParams();
  const headsetId = Number(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        const res = await getHeadsetRepairs(headsetId);
        setRows(res.data?.data?.repairs || []);
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.message || 'Failed to load repair history');
      } finally {
        setLoading(false);
      }
    })();
  }, [headsetId]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => navigate(-1)}>← Back</button>
        <button type="button" onClick={() => navigate(`/headsets/${headsetId}`)}>View Headset</button>
      </div>

      <h2 style={{ marginTop: 14 }}>Repair History (Headset #{headsetId})</h2>

      {loading ? (
        <div>Loading…</div>
      ) : err ? (
        <div style={{ color: 'crimson' }}>{err}</div>
      ) : rows.length === 0 ? (
        <div>No repair records found.</div>
      ) : (
        <div style={{ overflow: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: 10, textAlign: 'left' }}>Lot</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Status</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Vendor</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Brand Group</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Before</th>
                <th style={{ padding: 10, textAlign: 'left' }}>After</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Added</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Sent</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Received</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.lotItemId} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 10 }}>{r.lot?.lotCode || `Lot#${r.lot?.id}`}</td>
                  <td style={{ padding: 10 }}>{r.lot?.status || '—'}</td>
                  <td style={{ padding: 10 }}>{r.lot?.vendorName || '—'}</td>
                  <td style={{ padding: 10 }}>{r.lot?.brandGroup || '—'}</td>
                  <td style={{ padding: 10 }}>{r.conditionBefore || '—'}</td>
                  <td style={{ padding: 10 }}>{r.conditionAfter || '—'}</td>
                  <td style={{ padding: 10 }}>{fmtDate(r.addedAt)}</td>
                  <td style={{ padding: 10 }}>{fmtDate(r.itemSentAt)}</td>
                  <td style={{ padding: 10 }}>{fmtDate(r.itemReceivedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}