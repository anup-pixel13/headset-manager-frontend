import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { createAgent, getProcessesForDropdown } from '../services/agentService';
import { useAuth } from '../auth/AuthContext';
import './CreateAgent.css';

const TEMP_ID_RE = /^TRG\d{1,5}$/i;
const PERM_ID_RE = /^AIPL\d{1,5}$/i;

export default function CreateAgent() {
  const navigate = useNavigate();
  const { user } = useAuth(); // not used currently, but keeping as you had it

  const alertRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [processes, setProcesses] = useState([]);

  const [form, setForm] = useState({
    name: '',
    idType: 'temp', // 'temp' | 'permanent'
    temp_employee_id: '',
    employee_id: '',
    process_id: '',
    email: '',
    phone: '',
    status: 'active',
  });

  const [message, setMessage] = useState({ type: '', text: '' });

  const focusAlert = () => {
    // Make it focusable + scroll into view
    const el = alertRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // small timeout helps after layout changes
    setTimeout(() => el.focus?.(), 50);
	
	
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const p = await getProcessesForDropdown();
        setProcesses(p.data?.data || []);
      } catch (e) {
        console.error(e);
        setMessage({ type: 'error', text: 'Failed to load processes.' });
        queueMicrotask(focusAlert);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizedTempId = useMemo(() => String(form.temp_employee_id || '').trim().toUpperCase(), [form.temp_employee_id]);
  const normalizedPermId = useMemo(() => String(form.employee_id || '').trim().toUpperCase(), [form.employee_id]);

  const validate = () => {
    if (!form.name.trim()) return 'Name is required.';
    if (!form.process_id) return 'Process is required.';

    if (form.idType === 'temp') {
      if (!normalizedTempId) return 'Temporary Employee ID is required.';
      if (!TEMP_ID_RE.test(normalizedTempId)) {
        return 'Temporary Employee ID must be in format TRG12345 (TRG + 1 to 5 digits).';
      }
    }

    if (form.idType === 'permanent') {
      if (!normalizedPermId) return 'Permanent Employee ID is required.';
      if (!PERM_ID_RE.test(normalizedPermId)) {
        return 'Permanent Employee ID must be in format AIPL12345 (AIPL + 1 to 5 digits).';
      }
    }

    // Optional: email basic sanity if provided
    const email = String(form.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return 'Please enter a valid email address.';
    }

    return '';
  };

  const canSubmit = useMemo(() => {
    return validate() === '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, normalizedTempId, normalizedPermId]);

  const onChange = (k, v) => {
    setMessage({ type: '', text: '' });
    setForm((p) => ({ ...p, [k]: v }));
  };

  const submit = async (e) => {
    e.preventDefault();

    const err = validate();
    if (err) {
      setMessage({ type: 'error', text: err });
      queueMicrotask(focusAlert);
      return;
    }

    const payload = {
      name: form.name.trim(),
      process_id: Number(form.process_id),
      status: form.status,
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      employee_id: form.idType === 'permanent' ? normalizedPermId : undefined,
      temp_employee_id: form.idType === 'temp' ? normalizedTempId : undefined,
    };

    try {
      setSubmitting(true);

      const res = await createAgent(payload);

      const created = res.data?.data;
      const msg = res.data?.message || 'Agent created successfully';

      setMessage({
        type: 'success',
        text: `${msg}${created?.name ? ` • ${created.name}` : ''}${
          created?.employeeId ? ` (${created.employeeId})` : ''
        }`,
      });

      // focus success message at top
      queueMicrotask(focusAlert);

      // reset
      setForm({
        name: '',
        idType: 'temp',
        temp_employee_id: '',
        employee_id: '',
        process_id: '',
        email: '',
        phone: '',
        status: 'active',
      });
    } catch (e2) {
      console.error(e2);

      const backendMsg = e2?.response?.data?.message || 'Create agent failed.';
      setMessage({ type: 'error', text: backendMsg });

      // focus error message at top
      queueMicrotask(focusAlert);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ca-container">
      <div className="container ca-content">
        <div className="ca-top-nav">
          <button className="ca-btn-back" onClick={() => navigate('/dashboard')} type="button">
            <i className="bi bi-arrow-left" /> Back to Dashboard
          </button>
          <button className="ca-btn-secondary" onClick={() => navigate('/assign-headset')} type="button">
            <i className="bi bi-person-plus" /> Assign Headset
          </button>
        </div>

        <div className="ca-header-card">
          <h1 className="ca-title">
            <i className="bi bi-person-badge" /> Create Agent
          </h1>
          <p className="ca-subtitle">
            Create agent (temp/permanent ID) and assign process. The agent will appear in Assign Headset dropdown.
          </p>
        </div>

        {/* Top message area (focus target) */}
        {message.text && (
          <div
            ref={alertRef}
            tabIndex={-1}
            className={`ca-alert ${message.type}`}
            aria-live="polite"
            aria-atomic="true"
          >
            <i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
            <span>{message.text}</span>
          </div>
        )}

        {loading ? (
          <div className="ca-loading">
            <div className="ca-spinner" />
            <p>Loading...</p>
          </div>
        ) : (
          <>
            <form className="ca-form-card" onSubmit={submit}>
              <div className="ca-grid">
                <div className="ca-field full">
                  <label>Name *</label>
                  <input
                    className="ca-input"
                    value={form.name}
                    onChange={(e) => onChange('name', e.target.value)}
                    placeholder="e.g. Rohit Verma"
                  />
                </div>

                <div className="ca-field">
                  <label>ID Type *</label>
                  <select
                    className="ca-select"
                    value={form.idType}
                    onChange={(e) => {
                      const next = e.target.value;
                      onChange('idType', next);

                      // optional: clear the other id field to avoid confusion
                      setForm((p) => ({
                        ...p,
                        idType: next,
                        temp_employee_id: next === 'temp' ? p.temp_employee_id : '',
                        employee_id: next === 'permanent' ? p.employee_id : '',
                      }));
                    }}
                  >
                    <option value="temp">Temporary Employee ID</option>
                    <option value="permanent">Permanent Employee ID</option>
                  </select>
                </div>

                {form.idType === 'temp' ? (
                  <div className="ca-field">
                    <label>Temp Employee ID *</label>
                    <input
                      className="ca-input"
                      value={form.temp_employee_id}
                      onChange={(e) => onChange('temp_employee_id', e.target.value.toUpperCase())}
                      placeholder="e.g. TRG12345"
                      inputMode="text"
                      autoCapitalize="characters"
                    />
                    <div className="ca-hint">Format: TRG + 1 to 5 digits (e.g., TRG7, TRG12345)</div>
                  </div>
                ) : (
                  <div className="ca-field">
                    <label>Permanent Employee ID *</label>
                    <input
                      className="ca-input"
                      value={form.employee_id}
                      onChange={(e) => onChange('employee_id', e.target.value.toUpperCase())}
                      placeholder="e.g. AIPL12345"
                      inputMode="text"
                      autoCapitalize="characters"
                    />
                    <div className="ca-hint">Format: AIPL + 1 to 5 digits (e.g., AIPL7, AIPL12345)</div>
                  </div>
                )}

                <div className="ca-field">
                  <label>Process *</label>
                  <select
                    className="ca-select"
                    value={form.process_id}
                    onChange={(e) => onChange('process_id', e.target.value)}
                  >
                    <option value="">Select process...</option>
                    {processes.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} {p.category ? `• ${p.category}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ca-field">
                  <label>Status</label>
                  <select className="ca-select" value={form.status} onChange={(e) => onChange('status', e.target.value)}>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                    <option value="training">training</option>
                    <option value="ojt">ojt</option>
                  </select>
                </div>

                <div className="ca-field">
                  <label>Email (optional)</label>
                  <input
                    className="ca-input"
                    value={form.email}
                    onChange={(e) => onChange('email', e.target.value)}
                    placeholder="e.g. name@company.com"
                  />
                </div>

                <div className="ca-field">
                  <label>Phone (optional)</label>
                  <input
                    className="ca-input"
                    value={form.phone}
                    onChange={(e) => onChange('phone', e.target.value)}
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              <div className="ca-actions">
                <button className="ca-submit" type="submit" disabled={!canSubmit || submitting}>
                  {submitting ? (
                    <>
                      <span className="ca-btn-spinner" /> Creating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle" /> Create Agent
                    </>
                  )}
                </button>

                <button className="ca-cancel" type="button" onClick={() => navigate('/dashboard')} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}