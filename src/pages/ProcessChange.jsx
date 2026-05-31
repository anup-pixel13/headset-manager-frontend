import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SearchableSelect from '../components/SearchableSelect';

import { getAvailableHeadsets, getHeadsetBrands } from '../services/headsetService';
import { getAgentsForDropdown, getProcessesForDropdown } from '../services/agentService';
import { getActiveAssignmentByAgent } from '../services/assignmentService';
import { processChangeV2 } from '../services/transferService';

import { useAuth } from '../auth/AuthContext';
import './AssignHeadset.css';

import { formatHeadsetType, formatBrandName } from '../utils/headsetFormat';

const PAYMENT_MODES = [
  { value: 'salary_deduction', label: 'Deduction from Salary' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
];

const RETURN_CONDITIONS = [
  { value: 'good', label: 'good' },
  { value: 'fair', label: 'fair' },
  { value: 'damaged', label: 'damaged' },
  { value: 'lost', label: 'lost' },
];

const TIER_OPTIONS = [
  { value: 'all', label: 'All Deposits' },
  { value: '1750', label: '₹1750 Deposit (Refund ₹1100)' },
  { value: '1250', label: '₹1250 Deposit (Refund ₹800)' },
];

// Map headset_type -> tier
const tierOfHeadsetType = (t) => {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'voix_enc') return '1750';
  if (v === 'ojt' || v === 'yjack') return '0';
  return '1250';
};

export default function ProcessChange() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();

  // ✅ admin-only guard: prefer user.role when available
  const isAdminRole = typeof isAdmin === 'boolean' ? isAdmin : String(user?.role || '').toLowerCase() === 'admin';

  const alertRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // used to restore condition when user toggles Lost -> Received again
  const [lastNonLostCondition, setLastNonLostCondition] = useState('good');

  const [brands, setBrands] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [agents, setAgents] = useState([]);

  const [filter, setFilter] = useState({
    headsetType: 'all',
    brandId: 'all',
    tier: 'all', // ✅ new
  });

  const [form, setForm] = useState({
    agentId: '',
    toProcessId: '',
    newHeadsetId: '',

    // Old headset return info (ONLY meaningful when replacing headset)
    oldHeadsetReceived: true,
    oldReturnCondition: 'good',

    depositAmount: '',
    paymentMode: 'salary_deduction',
    receiptNumber: '',
    tlName: '',
    managerName: '',
    notes: '',
  });

  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [selectedNewHeadsetMeta, setSelectedNewHeadsetMeta] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const focusAlert = () => {
    const el = alertRef.current;
    if (!el) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.focus?.(), 50);
  };

  // Replacement mode flag
  const isReplacingHeadset = useMemo(() => !!form.newHeadsetId, [form.newHeadsetId]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdminRole) navigate('/dashboard', { replace: true });
  }, [authLoading, isAdminRole, navigate]);

  // initial dropdowns
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [b, p, a] = await Promise.all([
          getHeadsetBrands(),
          getProcessesForDropdown(),
          getAgentsForDropdown({ has_headset: 'true' }),
        ]);

        setBrands(b.data?.data || []);
        setProcesses(p.data?.data || []);
        setAgents(a.data?.data || []);
      } catch (e) {
        console.error(e);
        setMessage({ type: 'error', text: 'Failed to load dropdown data.' });
        queueMicrotask(focusAlert);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If not replacing headset, reset old-return fields (they are disabled anyway)
  useEffect(() => {
    if (!isReplacingHeadset) {
      setForm((p) => ({
        ...p,
        oldHeadsetReceived: true,
        oldReturnCondition: 'good',
      }));
    }
  }, [isReplacingHeadset]);

  // When replacing headset:
  // - if NOT received => force lost
  // - if received again => restore lastNonLostCondition
  useEffect(() => {
    if (!isReplacingHeadset) return;

    if (!form.oldHeadsetReceived) {
      if (form.oldReturnCondition !== 'lost') {
        setForm((p) => ({ ...p, oldReturnCondition: 'lost' }));
      }
      return;
    }

    if (form.oldReturnCondition === 'lost') {
      setForm((p) => ({ ...p, oldReturnCondition: lastNonLostCondition || 'good' }));
    }
  }, [isReplacingHeadset, form.oldHeadsetReceived, form.oldReturnCondition, lastNonLostCondition]);

  const onChange = (name, value) => {
    setMessage({ type: '', text: '' });

    if (name === 'oldReturnCondition') {
      const v = String(value || '');
      if (v && v !== 'lost') setLastNonLostCondition(v);
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Load current assignment when agent selected
  useEffect(() => {
    if (!form.agentId) {
      setCurrentAssignment(null);
      setSelectedNewHeadsetMeta(null);
      setForm((p) => ({ ...p, newHeadsetId: '', depositAmount: '' }));
      return;
    }

    (async () => {
      try {
        const res = await getActiveAssignmentByAgent(form.agentId);
        const a = res.data?.data || null;
        setCurrentAssignment(a);

        // Prefill TL/Manager from current assignment (editable)
        setForm((prev) => ({
          ...prev,
          tlName: prev.tlName || a?.tlName || '',
          managerName: prev.managerName || a?.managerName || '',
          depositAmount: prev.depositAmount !== '' ? prev.depositAmount : String(a?.headset?.depositAmount ?? ''),
        }));
      } catch (e) {
        console.error(e);
        setCurrentAssignment(null);
        setMessage({ type: 'error', text: e?.response?.data?.message || 'Failed to load current assignment.' });
        queueMicrotask(focusAlert);
      }
    })();
  }, [form.agentId]);

  // When new headset meta changes: suggest deposit if blank
  useEffect(() => {
    if (!selectedNewHeadsetMeta) return;

    setForm((prev) => ({
      ...prev,
      depositAmount: prev.depositAmount !== '' ? prev.depositAmount : String(selectedNewHeadsetMeta.depositAmount ?? ''),
    }));
  }, [selectedNewHeadsetMeta]);

  const brandLabelById = useMemo(() => {
    const map = new Map();
    brands.forEach((b) => map.set(String(b.id), formatBrandName(b.brand_name)));
    return map;
  }, [brands]);

  // Agent options for SearchableSelect
  const agentOptions = useMemo(() => {
    return (agents || []).map((a) => ({
      value: String(a.id),
      label: `${a.name} (${a.employeeId}) ${a.process ? `• ${a.process}` : ''}`,
      meta: a,
    }));
  }, [agents]);

  // Headset type options (static list is more stable since we're searching remotely)
  const headsetTypeOptions = useMemo(() => {
    return ['all', 'voix_enc', 'voix_2xx', 'voix_3xx', 'voix_nxx', 'voix_xxx', 'tech', 'ojt', 'yjack'];
  }, []);

  // preview fee (backend is source of truth)
  const previewAdjustment = useMemo(() => {
    const oldDep = Number(currentAssignment?.headset?.depositAmount || 0);
    const newDep = Number(form.depositAmount || 0);
    if (!oldDep || !newDep) return 0;
    return newDep - oldDep;
  }, [currentAssignment, form.depositAmount]);

  const validate = () => {
    if (!form.agentId) return 'Please select an agent.';
    if (!currentAssignment) return 'No active assignment found for this agent.';
    if (!form.toProcessId) return 'Please select the new process.';
    if (!form.depositAmount || Number(form.depositAmount) <= 0) return 'Please enter a valid deposit amount.';
    if (!form.tlName?.trim()) return 'TL Name is required';
    if (!form.managerName?.trim()) return 'Manager Name is required';

    // Only validate old-return info when replacing headset
    if (isReplacingHeadset) {
      if (!form.oldHeadsetReceived && form.oldReturnCondition !== 'lost') {
        return 'If old headset not received, condition must be lost.';
      }
      if (form.oldHeadsetReceived && !String(form.oldReturnCondition || '').trim()) {
        return 'Please select old return condition.';
      }
    }

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

      const payload = {
        agent_id: Number(form.agentId),
        to_process_id: Number(form.toProcessId),
        new_headset_id: form.newHeadsetId ? Number(form.newHeadsetId) : undefined,

        deposit_amount: Number(form.depositAmount),

        payment_mode: form.paymentMode,
        receipt_number: form.receiptNumber,
        notes: form.notes,

        tl_name: form.tlName.trim(),
        manager_name: form.managerName.trim(),
      };

      // Safer: send ALWAYS
      payload.old_headset_received = Boolean(form.oldHeadsetReceived);
      payload.old_return_condition = payload.old_headset_received ? form.oldReturnCondition : 'lost';

      // If not replacing headset, still treat old as received/good
      if (!isReplacingHeadset) {
        payload.old_headset_received = true;
        payload.old_return_condition = 'good';
      }

      const res = await processChangeV2(payload);

      const payloadRes = res.data;
      const msg = payloadRes?.message || 'Process change successful.';
      const data = payloadRes?.data || {};
      const newAssignmentId = data.newAssignmentId;

      setMessage({
        type: 'success',
        text: `${msg} (New Assignment #${newAssignmentId || 'N/A'})`,
      });
      queueMicrotask(focusAlert);

      if (newAssignmentId) {
        navigate(`/assignments/${newAssignmentId}/sign`, { replace: true });
      }
    } catch (e2) {
      console.error(e2);
      setMessage({ type: 'error', text: e2?.response?.data?.message || 'Process change failed.' });
      queueMicrotask(focusAlert);
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ Async search available headsets with filters
  const searchAvailableHeadsets = async (q) => {
    const query = String(q || '').trim();

    const res = await getAvailableHeadsets({
      search: query, // allow empty query (shows initial list)
      headset_type: filter.headsetType === 'all' ? '' : filter.headsetType,
      brand_id: filter.brandId === 'all' ? '' : filter.brandId,
      page: 1,
      limit: 30,
      sort_by: 'headset_number',
      sort_order: 'ASC',
    });

    let rows = res.data?.data || [];

    // tier filter client-side
    if (filter.tier !== 'all') {
      rows = rows.filter((h) => tierOfHeadsetType(h.headsetType) === filter.tier);
    }

    return rows.map((h) => ({
      value: String(h.id),
      label: `${h.headsetNumber} • ${formatHeadsetType(h.headsetType)}`,
      meta: h,
    }));
  };

  return (
    <div className="as-container">
      <div className="container as-content">
        <div className="as-top-nav">
          <button className="as-btn-back" onClick={() => navigate('/dashboard')} type="button">
            <i className="bi bi-arrow-left" /> Back to Dashboard
          </button>
          <button className="as-btn-secondary" onClick={() => navigate('/inventory')} type="button">
            <i className="bi bi-headset" /> Inventory
          </button>
        </div>

        <div className="as-header-card">
          <div>
            <h1 className="as-title">
              <i className="bi bi-arrow-repeat" /> Process Change / Replace Headset
            </h1>
            <p className="as-subtitle">
              Creates NEW assignment, invalidates old assignment, and requires new signatures + PDF
            </p>
          </div>
        </div>

        {/* ✅ focusable/smooth-scroll alert */}
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
              <h3>Current Assignment (Read-only)</h3>
              {currentAssignment ? (
                <div style={{ lineHeight: 1.6 }}>
                  <div><b>Old Assignment ID:</b> {currentAssignment.id}</div>
                  <div><b>Old Process:</b> {currentAssignment.process?.name}</div>
                  <div>
                    <b>Old Headset:</b> {currentAssignment.headset?.number} •{' '}
                    {formatHeadsetType(currentAssignment.headset?.type)} •{' '}
                    {formatBrandName(currentAssignment.headset?.brand || '')}
                  </div>
                  <div><b>Old Deposit (brand):</b> {currentAssignment.headset?.depositAmount}</div>
                  <div><b>Old Refund Eligible:</b> {currentAssignment.headset?.refundAmount}</div>
                </div>
              ) : (
                <div>Select agent to load assignment…</div>
              )}
            </div>

            <div className="as-filters-card">
              <h3>New Headset (Optional) — Available Headsets Filter</h3>

              <div className="as-filters-row">
                <div className="as-field-inline">
                  <label>Type</label>
                  <select
                    className="as-select"
                    value={filter.headsetType}
                    onChange={(e) => setFilter((p) => ({ ...p, headsetType: e.target.value }))}
                  >
                    {headsetTypeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t === 'all' ? 'All Types' : formatHeadsetType(t)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="as-field-inline">
                  <label>Brand</label>
                  <select
                    className="as-select"
                    value={filter.brandId}
                    onChange={(e) => setFilter((p) => ({ ...p, brandId: e.target.value }))}
                  >
                    <option value="all">All Brands</option>
                    {brands.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {formatBrandName(b.brand_name)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="as-field-inline">
                  <label>Deposit Tier</label>
                  <select
                    className="as-select"
                    value={filter.tier}
                    onChange={(e) => setFilter((p) => ({ ...p, tier: e.target.value }))}
                  >
                    {TIER_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="as-filter-meta">
                  Tip: Click New Headset dropdown to load. Type headset # to search.
                </div>
              </div>
            </div>

            <form className="as-form-card" onSubmit={submit}>
              <h3>New Assignment Details</h3>

              <div className="as-grid">
                <div className="as-field">
                  <label>Agent (Has active headset)</label>

                  <SearchableSelect
                    value={form.agentId}
                    onChange={(v) => onChange('agentId', v)}
                    placeholder="Type agent name / employee id..."
                    minChars={0}
                    onSearch={async (q) => {
                      const query = String(q || '').toLowerCase();
                      return agentOptions
                        .filter((o) => o.label.toLowerCase().includes(query))
                        .slice(0, 25);
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
                  <label>New Process</label>
                  <select className="as-select" value={form.toProcessId} onChange={(e) => onChange('toProcessId', e.target.value)}>
                    <option value="">Select process...</option>
                    {processes.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} {p.category ? `• ${p.category}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="as-field">
                  <label>New Headset (optional)</label>

                  <SearchableSelect
                    value={form.newHeadsetId}
                    onChange={(v) => onChange('newHeadsetId', v)}
                    placeholder="Type headset # (available)..."
                    minChars={0}
                    onSearch={async (q) => {
                      const opts = await searchAvailableHeadsets(q);

                      // keep selected meta in sync when selected id appears
                      const found = opts.find((o) => String(o.value) === String(form.newHeadsetId));
                      if (found?.meta) setSelectedNewHeadsetMeta(found.meta);

                      return opts;
                    }}
                    noResultsText="No available headsets"
                    renderOption={(opt) => (
                      <div>
                        <div style={{ fontWeight: 900 }}>{opt.meta?.headsetNumber}</div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {formatHeadsetType(opt.meta?.headsetType)} •{' '}
                          {formatBrandName(opt.meta?.brand || brandLabelById.get(String(opt.meta?.brandId)) || '')}
                          {opt.meta?.condition ? ` • cond: ${opt.meta.condition}` : ''}
                        </div>
                      </div>
                    )}
                  />

                  {!form.newHeadsetId ? (
                    <div className="as-hint">Leaving blank keeps the same headset (process change only).</div>
                  ) : selectedNewHeadsetMeta ? (
                    <div className="as-hint">
                      Suggested deposit: <strong>{selectedNewHeadsetMeta.depositAmount ?? 'N/A'}</strong> • Refund:{' '}
                      <strong>{selectedNewHeadsetMeta.refundAmount ?? 'N/A'}</strong>
                    </div>
                  ) : null}
                </div>

                {/* Old headset return info — only enabled when replacing headset */}
                <div className="as-field">
                  <label>Old Headset Received?</label>
                  <select
                    className="as-select"
                    value={form.oldHeadsetReceived ? 'true' : 'false'}
                    onChange={(e) => onChange('oldHeadsetReceived', e.target.value === 'true')}
                    disabled={!currentAssignment || !isReplacingHeadset}
                    title={!isReplacingHeadset ? 'Enable by selecting a New Headset (replacement)' : ''}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No (Lost)</option>
                  </select>
                </div>

                <div className="as-field">
                  <label>Old Return Condition</label>
                  <select
                    className="as-select"
                    value={form.oldReturnCondition}
                    onChange={(e) => onChange('oldReturnCondition', e.target.value)}
                    disabled={!currentAssignment || !isReplacingHeadset || !form.oldHeadsetReceived}
                    title={
                      !isReplacingHeadset
                        ? 'Enable by selecting a New Headset (replacement)'
                        : !form.oldHeadsetReceived
                          ? 'Forced to lost when not received'
                          : ''
                    }
                  >
                    {RETURN_CONDITIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>

                  {!isReplacingHeadset ? (
                    <div className="as-hint">
                      Select a <b>New Headset</b> to enable old headset return details.
                    </div>
                  ) : null}
                </div>

                {/* ✅ TL + Manager consistent styling */}
                <div className="as-field">
                  <label>
                    TL Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="as-input"
                    value={form.tlName}
                    onChange={(e) => onChange('tlName', e.target.value)}
                    placeholder="Enter TL name"
                    required
                  />
                </div>

                <div className="as-field">
                  <label>
                    Manager Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="as-input"
                    value={form.managerName}
                    onChange={(e) => onChange('managerName', e.target.value)}
                    placeholder="Enter Manager name"
                    required
                  />
                </div>

                <div className="as-field">
                  <label>Deposit Amount (auto, editable)</label>
                  <input
                    className="as-input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.depositAmount}
                    onChange={(e) => onChange('depositAmount', e.target.value)}
                    placeholder="e.g. 1250 or 1750"
                  />
                  <div className="as-hint">
                    <b>Preview adjustment:</b> {previewAdjustment > 0 ? `+${previewAdjustment}` : previewAdjustment}
                  </div>
                </div>

                <div className="as-field">
                  <label>Payment Mode (for adjustment)</label>
                  <select className="as-select" value={form.paymentMode} onChange={(e) => onChange('paymentMode', e.target.value)}>
                    {PAYMENT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="as-field">
                  <label>Receipt Number (optional, for adjustment)</label>
                  <input
                    className="as-input"
                    value={form.receiptNumber}
                    onChange={(e) => onChange('receiptNumber', e.target.value)}
                    placeholder="Leave blank to auto-generate"
                  />
                </div>

                <div className="as-field full">
                  <label>Notes (optional)</label>
                  <textarea
                    className="as-textarea"
                    value={form.notes}
                    onChange={(e) => onChange('notes', e.target.value)}
                    placeholder="Any extra notes..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="as-form-actions">
                <button className="as-submit" type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <span className="as-btn-spinner" /> Processing...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle" /> Create New Assignment
                    </>
                  )}
                </button>

                <button className="as-cancel" type="button" onClick={() => navigate('/dashboard')} disabled={submitting}>
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