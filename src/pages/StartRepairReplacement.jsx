import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import SearchableSelect from '../components/SearchableSelect';

import { getAgentsForDropdown } from '../services/agentService';
import { getActiveAssignmentByAgent } from '../services/assignmentService';
import { getAllHeadsets } from '../services/headsetService';
import { startRepairReplacement } from '../services/repairService';

import { formatHeadsetType } from '../utils/headsetFormat';
import './StartRepairReplacement.css';

const OLD_CONDITIONS = [
  { value: 'damaged', label: 'damaged' },
  { value: 'fair', label: 'fair' },
  { value: 'good', label: 'good' },
  { value: 'lost', label: 'lost' },
];

export default function StartRepairReplacement() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();

  const alertRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [agents, setAgents] = useState([]);
  const [currentAssignment, setCurrentAssignment] = useState(null);

  const [form, setForm] = useState({
    agentId: '',
    tempHeadsetId: '',
    oldCondition: 'damaged',
    notes: '',
  });

  const [message, setMessage] = useState({ type: '', text: '' });

  const focusAlert = () => {
    const el = alertRef.current;
    if (!el) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.focus?.(), 50);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [authLoading, isAdmin, navigate]);

  // Load agents list
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setMessage({ type: '', text: '' });

        const res = await getAgentsForDropdown({ has_headset: 'true' });
        setAgents(res.data?.data || []);
      } catch (e) {
        console.error(e);
        setAgents([]);
        setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load agents.' });
        queueMicrotask(focusAlert);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load current assignment when agent selected
  useEffect(() => {
    if (!form.agentId) {
      setCurrentAssignment(null);
      return;
    }

    (async () => {
      try {
        setMessage({ type: '', text: '' });
        const res = await getActiveAssignmentByAgent(form.agentId);
        setCurrentAssignment(res.data?.data || null);
      } catch (e) {
        console.error(e);
        setCurrentAssignment(null);
        setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load agent assignment.' });
        queueMicrotask(focusAlert);
      }
    })();
  }, [form.agentId]);

  const agentOptions = useMemo(() => {
    return (agents || []).map((a) => ({
      value: String(a.id),
      label: `${a.name} (${a.employeeId})`,
      meta: a,
    }));
  }, [agents]);

  const validate = () => {
    if (!form.agentId) return 'Select an agent.';
    if (!currentAssignment) return 'No active assignment found for agent.';
    if (!form.tempHeadsetId) return 'Select a temp headset.';
    if (!form.oldCondition) return 'Select old headset condition.';
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();

    const err = validate();
    if (err) {
      setMessage({ type: 'error', text: err });
      queueMicrotask(focusAlert);
      return;
    }

    try {
      setSubmitting(true);
      setMessage({ type: '', text: '' });

      const res = await startRepairReplacement({
        agent_id: Number(form.agentId),
        temp_headset_id: Number(form.tempHeadsetId),
        old_condition: form.oldCondition,
        notes: form.notes,
      });

      setMessage({ type: 'success', text: res.data?.message || 'Replacement started.' });
      queueMicrotask(focusAlert);

      setForm((p) => ({
        ...p,
        tempHeadsetId: '',
        notes: '',
        oldCondition: 'damaged',
      }));

      setTimeout(() => navigate('/repairs/replacements'), 600);
    } catch (e2) {
      console.error(e2);
      setMessage({ type: 'error', text: e2?.response?.data?.message || 'Failed to start replacement.' });
      queueMicrotask(focusAlert);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="as-container">
      <div className="container as-content">
        <div className="as-top-nav">
          <button className="as-btn-back" onClick={() => navigate('/repairs')} type="button">
            <i className="bi bi-arrow-left" /> Repair Lots
          </button>

          <div className="as-top-actions">
            <button className="as-btn-secondary" type="button" onClick={() => navigate('/repairs/replacements')}>
              <i className="bi bi-arrow-repeat" /> Temp Replacements
            </button>
            <button className="as-btn-secondary" type="button" onClick={() => navigate('/dashboard')}>
              <i className="bi bi-house-door" /> Dashboard
            </button>
          </div>
        </div>

        <div className="as-header-card">
          <div>
            <h1 className="as-title">
              <i className="bi bi-tools" /> Start Temp Replacement (Repair)
            </h1>
            <p className="as-subtitle">Assign a temporary headset while original goes for repair (Admin only)</p>
          </div>
        </div>

        {message.text && (
          <div
            ref={alertRef}
            tabIndex={-1}
            className={`as-alert ${message.type}`}
            aria-live="polite"
            aria-atomic="true"
          >
            <i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
            <span>{message.text}</span>
          </div>
        )}

        {loading ? (
          <div className="as-loading">
            <div className="as-spinner" />
            <p>Loading form...</p>
          </div>
        ) : (
          <>
            <div className="as-filters-card">
              <h3>Current Assignment Preview</h3>
              {currentAssignment ? (
                <div className="srp-preview">
                  <div>
                    <b>Assignment ID:</b> {currentAssignment.id}
                  </div>
                  <div>
                    <b>Process:</b> {currentAssignment.process?.name || '—'}
                  </div>
                  <div>
                    <b>Headset:</b> {currentAssignment.headset?.number || '—'} •{' '}
                    {formatHeadsetType(currentAssignment.headset?.type)} • {currentAssignment.headset?.brand || ''}
                  </div>
                  <div>
                    <b>Status:</b> {currentAssignment.headset?.status || '—'}
                  </div>
                </div>
              ) : (
                <div>Select an agent to load assignment details…</div>
              )}
            </div>

            <form className="as-form-card" onSubmit={submit}>
              <h3>Replacement Details</h3>

              <div className="as-grid">
                <div className="as-field">
                  <label>Agent (has active headset)</label>
                  <SearchableSelect
                    value={form.agentId}
                    onChange={(v) => setForm((p) => ({ ...p, agentId: v }))}
                    placeholder="Type agent name / employee id..."
                    minChars={0}
                    onSearch={async (q) => {
                      const query = String(q || '').toLowerCase();
                      return agentOptions.filter((o) => o.label.toLowerCase().includes(query)).slice(0, 25);
                    }}
                    renderOption={(opt) => (
                      <div>
                        <div style={{ fontWeight: 900 }}>{opt.meta?.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {opt.meta?.employeeId} {opt.meta?.process ? `• ${opt.meta.process}` : ''}
                        </div>
                      </div>
                    )}
                  />
                </div>

                <div className="as-field">
                  <label>Temp Headset (available)</label>
                  <SearchableSelect
                    value={form.tempHeadsetId}
                    onChange={(v) => setForm((p) => ({ ...p, tempHeadsetId: v }))}
                    placeholder="Type headset # (available)..."
                    minChars={0}
                    onSearch={async (q) => {
                      const query = String(q || '').trim();

                      const res = await getAllHeadsets({
                        search: query,
                        status: 'available',
                        page: 1,
                        limit: 20,
                        sort_by: 'headset_number',
                        sort_order: 'ASC',
                      });

                      const rows = res.data?.data || [];
                      return rows.map((h) => ({
                        value: String(h.id),
                        label: `${h.headsetNumber} • ${h.status} • ${h.headsetType}`,
                        meta: h,
                      }));
                    }}
                    renderOption={(opt) => (
                      <div>
                        <div style={{ fontWeight: 900 }}>{opt.meta?.headsetNumber}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {opt.meta?.status} • {formatHeadsetType(opt.meta?.headsetType)} • cond: {opt.meta?.condition || '—'}
                        </div>
                      </div>
                    )}
                  />
                </div>

                <div className="as-field">
                  <label>Old headset condition (for marking)</label>
                  <select
                    className="as-select"
                    value={form.oldCondition}
                    onChange={(e) => setForm((p) => ({ ...p, oldCondition: e.target.value }))}
                  >
                    {OLD_CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="as-field full">
                  <label>Notes (optional)</label>
                  <textarea
                    className="as-textarea"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="e.g., Mic issue / cable damage / one side not working..."
                  />
                </div>
              </div>

              <div className="as-form-actions">
                <button className="as-cancel" type="button" onClick={() => navigate('/repairs')} disabled={submitting}>
                  Cancel
                </button>
                <button className="as-submit" type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="as-btn-spinner" /> Starting...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle" /> Start Replacement
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}