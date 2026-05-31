import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { getDeassignFormData, deassignAgent } from '../services/agentDeassignService';
import { formatHeadsetType } from '../utils/headsetFormat';

import './Dashboard.css';

const toIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const TODAY = toIso(new Date());

export default function DeassignAgent() {
  const { id } = useParams(); // agent_id
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [message, setMessage] = useState({ type: '', text: '' });
  const [data, setData] = useState(null);

  const [form, setForm] = useState({
    reason: '',
    reason_date: TODAY,
    headset_received: true,
    return_condition: 'good',
    refund_eligible: true,
    refund_amount: '',
    remarks: '',
  });

  const agent = data?.agent || null;
  const current = data?.current || null;

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setMessage({ type: '', text: '' });

        const res = await getDeassignFormData(id);
        const payload = res.data?.data || null;
        setData(payload);

        // initialize defaults
        setForm((p) => ({
          ...p,
          reason: payload?.reasons?.[0] || '',
          refund_amount: String(payload?.defaults?.refundAmount ?? ''),
          refund_eligible: true,
          headset_received: true,
          return_condition: 'good',
          reason_date: TODAY,
        }));
      } catch (e) {
        console.error(e);
        setData(null);
        setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load de-assign form.' });
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onChange = (k, v) => {
    setMessage({ type: '', text: '' });
    setForm((p) => ({ ...p, [k]: v }));
  };

  // if headset not received -> force return_condition to 'lost'
  useEffect(() => {
    if (!form.headset_received) {
      setForm((p) => ({ ...p, return_condition: 'lost' }));
    }
  }, [form.headset_received]);

  const canSubmit = useMemo(() => {
    if (!form.reason || !form.reason_date) return false;
    if (form.refund_eligible && (form.refund_amount === '' || form.refund_amount === null)) return false;
    return true;
  }, [form.reason, form.reason_date, form.refund_eligible, form.refund_amount]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) {
      setMessage({ type: 'error', text: 'Please fill required fields.' });
      return;
    }

    try {
      setSubmitting(true);
      setMessage({ type: '', text: '' });

      const payload = {
        reason: form.reason,
        reason_date: form.reason_date,
        headset_received: !!form.headset_received,
        return_condition: form.return_condition,
        refund_eligible: !!form.refund_eligible,
        refund_amount: form.refund_eligible ? Number(form.refund_amount) : null,
        remarks: form.remarks?.trim() || null,
      };

      const res = await deassignAgent(id, payload);
      const msg = res.data?.message || 'De-assigned successfully';

      // go to refunds in_progress (new request will appear there)
      navigate('/refunds?tab=in_progress', { replace: true });
      // optional: could pass state, but you don't use it elsewhere
      alert(msg);
    } catch (e2) {
      console.error(e2);
      setMessage({ type: 'error', text: e2?.response?.data?.message || 'Failed to de-assign agent.' });
    } finally {
      setSubmitting(false);
    }
  };

  const fmtMoney = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const expectedRefund = (() => {
    if (!current) return null;
    // If tier is configured, prefer it; else fall back to defaults.refundAmount
    const tier = current?.tier?.refundAmount;
    if (tier !== null && tier !== undefined && tier !== '') return Number(tier);
    const def = data?.defaults?.refundAmount;
    return def !== null && def !== undefined && def !== '' ? Number(def) : null;
  })();

  return (
    <div className="dash-container">
      <div className="container dash-content">
        <div className="dash-header-card">
          <div className="dash-header-left">
            <h1 className="dash-title">
              <i className="bi bi-person-dash" /> De‑Assign Agent
            </h1>
            <p className="dash-subtitle">Close assignment + return headset + create refund request</p>
          </div>

          <div className="dash-date-range">
            <button className="dash-reset-btn" type="button" onClick={() => navigate(-1)}>
              <i className="bi bi-arrow-left" /> Back
            </button>
          </div>
        </div>

        {loading ? (
          <div className="dash-loading">
            <div className="dash-spinner" />
            <p>Loading de‑assign form...</p>
          </div>
        ) : !data ? (
          <div className="dash-empty">
            <i className="bi bi-inbox" />
            <h3>No data</h3>
            <p>Could not load form.</p>
          </div>
        ) : (
          <div className="dash-table-card">
            {message.text && <div className={`dash-table-alert ${message.type}`}>{message.text}</div>}

            {/* summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="dash-actions-card" style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Agent</h3>
                <div style={{ marginTop: 6 }}>
                  <div>
                    <strong>Name:</strong> {agent?.name}
                  </div>
                  <div>
                    <strong>Employee ID:</strong> {agent?.employeeId || '—'}
                  </div>
                  <div>
                    <strong>Status:</strong> {agent?.status || '—'}
                  </div>
                  <div>
                    <strong>Login Active:</strong> {agent?.userIsActive ? 'Yes' : 'No'}
                  </div>
                </div>
              </div>

              <div className="dash-actions-card" style={{ textAlign: 'left' }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Current Assignment</h3>
                {current ? (
                  <div style={{ marginTop: 6 }}>
                    <div>
                      <strong>Assignment ID:</strong> #{current.assignmentId}
                    </div>
                    <div>
                      <strong>Headset:</strong> {current.headset?.headsetNumber}
                    </div>
                    <div>
                      <strong>Type:</strong> {formatHeadsetType(current.headset?.headsetType)}
                    </div>
                    <div>
                      <strong>Tier Refund:</strong> {current.tier?.refundAmount ?? '—'}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}>No active assignment.</div>
                )}
              </div>
            </div>

            {/* always-visible hint */}
            <div className="dash-actions-card" style={{ textAlign: 'left', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                <i className="bi bi-info-circle" /> Refund Hint
              </h3>
              {current ? (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ opacity: 0.85 }}>
                      <strong>Headset Type (raw):</strong> {current?.headset?.headsetType || '—'}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      <strong>Tier Refund (configured):</strong> {current?.tier?.refundAmount ?? '—'}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      <strong>Tier Deposit:</strong> {current?.tier?.depositAmount ?? '—'}
                    </div>
                  </div>

                  <div>
                    <div style={{ opacity: 0.85 }}>
                      <strong>Paid Deposit:</strong> {current?.deposit?.paidDeposit ?? '—'}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      <strong>Expected Refund:</strong> {expectedRefund === null ? '—' : fmtMoney(expectedRefund)}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      <strong>Note:</strong> A refund request will be created after De‑Assign.
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8, opacity: 0.85 }}>No active assignment found for this agent.</div>
              )}
            </div>

            <form onSubmit={submit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Reason *</label>
                  <select className="dash-select" value={form.reason} onChange={(e) => onChange('reason', e.target.value)}>
                    {(data.reasons || []).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Reason Date *</label>
                  <input
                    className="dash-date-input"
                    type="date"
                    value={form.reason_date}
                    onChange={(e) => onChange('reason_date', e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Headset Received? *</label>
                  <select
                    className="dash-select"
                    value={form.headset_received ? 'true' : 'false'}
                    onChange={(e) => onChange('headset_received', e.target.value === 'true')}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No (Lost)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Return Condition *</label>
                  <select
                    className="dash-select"
                    value={form.return_condition}
                    onChange={(e) => onChange('return_condition', e.target.value)}
                    disabled={!form.headset_received}
                    title={!form.headset_received ? 'Forced to lost when headset not received' : ''}
                  >
                    {(data.returnConditions || []).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Refund Eligible? *</label>
                  <select
                    className="dash-select"
                    value={form.refund_eligible ? 'true' : 'false'}
                    onChange={(e) => onChange('refund_eligible', e.target.value === 'true')}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 6 }}>Refund Amount {form.refund_eligible ? '*' : ''}</label>
                  <input
                    className="dash-date-input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.refund_amount}
                    onChange={(e) => onChange('refund_amount', e.target.value)}
                    disabled={!form.refund_eligible}
                  />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: 6 }}>Remarks</label>
                  <textarea
                    className="dash-date-input"
                    style={{ width: '100%', height: 90 }}
                    value={form.remarks}
                    onChange={(e) => onChange('remarks', e.target.value)}
                    placeholder="Optional notes..."
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="dash-export-btn" type="submit" disabled={!canSubmit || submitting}>
                  {submitting ? 'Saving...' : 'De‑Assign'}
                </button>
                <button className="dash-reset-btn" type="button" onClick={() => navigate(-1)} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
