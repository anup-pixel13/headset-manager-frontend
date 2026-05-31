import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getHeadsetAssignments } from '../services/headsetService';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

export default function HeadsetAssignmentHistory() {
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
        const res = await getHeadsetAssignments(headsetId);
        setRows(res.data?.data?.assignments || []);
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.message || 'Failed to load assignment history');
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

      <h2 style={{ marginTop: 14 }}>Assignment History (Headset #{headsetId})</h2>

      {loading ? (
        <div>Loading…</div>
      ) : err ? (
        <div style={{ color: 'crimson' }}>{err}</div>
      ) : rows.length === 0 ? (
        <div>No assignments found.</div>
      ) : (
        <div style={{ overflow: 'auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ padding: 10, textAlign: 'left' }}>ID</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Kind</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Agent</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Process</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Assigned</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Returned</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Return Cond</th>
                <th style={{ padding: 10, textAlign: 'left' }}>Active</th>
                <th style={{ padding: 10 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 10 }}>#{a.id}</td>
                  <td style={{ padding: 10 }}>{a.assignmentKind || 'permanent'}</td>
                  <td style={{ padding: 10 }}>
                    {a.agent?.name || '—'} <span style={{ opacity: 0.8 }}>({a.agent?.employeeId || '—'})</span>
                  </td>
                  <td style={{ padding: 10 }}>{a.process?.name || '—'}</td>
                  <td style={{ padding: 10 }}>{fmtDate(a.assignmentDate)}</td>
                  <td style={{ padding: 10 }}>{fmtDate(a.returnDate)}</td>
                  <td style={{ padding: 10 }}>{a.returnCondition || '—'}</td>
                  <td style={{ padding: 10 }}>{a.isActive ? 'Yes' : 'No'}</td>
                  <td style={{ padding: 10 }}>
                    <button type="button" onClick={() => navigate(`/assignments/${a.id}`)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}