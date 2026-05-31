import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAssignmentById } from '../services/assignmentService';

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleString();
}

export default function AssignmentDetails() {
  const { id } = useParams();
  const assignmentId = Number(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [a, setA] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        const res = await getAssignmentById(assignmentId);
        setA(res.data?.data || null);
      } catch (e) {
        console.error(e);
        setErr(e?.response?.data?.message || 'Failed to load assignment');
      } finally {
        setLoading(false);
      }
    })();
  }, [assignmentId]);

  if (!assignmentId) return <div style={{ padding: 24 }}>Invalid assignment id</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => navigate(-1)}>← Back</button>
        {a?.headset?.id ? <button type="button" onClick={() => navigate(`/headsets/${a.headset.id}`)}>View Headset</button> : null}
      </div>

      <h2 style={{ marginTop: 14 }}>Assignment #{assignmentId}</h2>

      {loading ? (
        <div>Loading…</div>
      ) : err ? (
        <div style={{ color: 'crimson' }}>{err}</div>
      ) : !a ? (
        <div>Assignment not found</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Assignment</h3>
            <div><strong>Active:</strong> {a.isActive ? 'Yes' : 'No'}</div>
            <div><strong>Verified:</strong> {a.isVerified ? 'Yes' : 'No'}</div>
            <div><strong>Assigned:</strong> {fmtDate(a.assignmentDate)}</div>
            <div><strong>Returned:</strong> {fmtDate(a.returnDate)}</div>
            <div><strong>Return Condition:</strong> {a.returnCondition || '—'}</div>
            <div style={{ marginTop: 10 }}>
              <strong>Notes:</strong>
              <div style={{ whiteSpace: 'pre-wrap', opacity: 0.9 }}>{a.notes || '—'}</div>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Agent</h3>
            <div><strong>Name:</strong> {a.agent?.name || '—'}</div>
            <div><strong>Employee ID:</strong> {a.agent?.employeeId || '—'}</div>
            <div><strong>Manager:</strong> {a.agent?.manager || '—'}</div>
            <div><strong>Team Leader:</strong> {a.agent?.teamLeader || '—'}</div>

            <hr style={{ margin: '12px 0' }} />

            <h3 style={{ marginTop: 0 }}>Headset</h3>
            <div><strong>Number:</strong> {a.headset?.number || '—'}</div>
            <div><strong>Type:</strong> {a.headset?.type || '—'}</div>
            <div><strong>Brand:</strong> {a.headset?.brand || '—'}</div>
            <div><strong>Condition:</strong> {a.headset?.condition || '—'}</div>

            <hr style={{ margin: '12px 0' }} />

            <h3 style={{ marginTop: 0 }}>Process</h3>
            <div><strong>Name:</strong> {a.process?.name || '—'}</div>
            <div><strong>Category:</strong> {a.process?.category || '—'}</div>
          </div>
        </div>
      )}
    </div>
  );
}