import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import SearchableSelect from '../components/SearchableSelect';

import { getAvailableHeadsets, getHeadsetBrands } from '../services/headsetService';
import { getAgentsForDropdown, getProcessesForDropdown } from '../services/agentService';
import { assignHeadset } from '../services/assignmentService';
import { useAuth } from '../auth/AuthContext';
import './AssignHeadset.css';

import { formatHeadsetType, formatBrandName } from '../utils/headsetFormat';

const PAYMENT_MODES = [{ value: 'salary_deduction', label: 'Deduction from Salary' }];

const TIER_OPTIONS = [
  { value: 'all', label: 'All Deposits' },
  { value: '1750', label: '₹1750 Deposit (Refund ₹1100)' },
  { value: '1250', label: '₹1250 Deposit (Refund ₹800)' },
];

// Map headset_type -> tier
const tierOfHeadsetType = (t) => {
  const v = String(t || '').trim().toLowerCase();
  // Your rule: 1750 only for voix_enc, others are 1250 (tech/other voix types)
  if (v === 'voix_enc') return '1750';
  // yjack/ojt are 0 in your screenshot; keep them out of tier filtering unless "all"
  if (v === 'ojt' || v === 'yjack') return '0';
  return '1250';
};

export default function AssignHeadset() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();

  // ✅ admin-only guard (prefer user.role if available)
  const isAdminRole = typeof isAdmin === 'boolean' ? isAdmin : String(user?.role || '').toLowerCase() === 'admin';

  const alertRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [brands, setBrands] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [agents, setAgents] = useState([]);

  // Filters
  const [filter, setFilter] = useState({
    headsetType: 'all',
    brandId: 'all',
    tier: 'all', // ✅ NEW: 1750 / 1250 / all
  });

  // Form
  const [form, setForm] = useState({
    headsetId: '',
    agentId: '',
    processId: '',
    depositAmount: '',
    paymentMode: 'salary_deduction',
    receiptNumber: '',
    tlName: '',
    managerName: '',
    notes: '',
  });

  const [selectedHeadsetMeta, setSelectedHeadsetMeta] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  const focusAlert = () => {
    const el = alertRef.current;
    if (!el) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => el.focus?.(), 50);
  };

  // Guard: admin only
  useEffect(() => {
    if (authLoading) return;
    if (!isAdminRole) navigate('/dashboard', { replace: true });
  }, [authLoading, isAdminRole, navigate]);

  // Load brands, processes, agents
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [b, p, a] = await Promise.all([
          getHeadsetBrands(),
          getProcessesForDropdown(),
          getAgentsForDropdown({ has_headset: 'false' }),
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

  // Brand id -> label map
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

  // When headset selected, auto-fill deposit (only if blank)
  useEffect(() => {
    if (!selectedHeadsetMeta) return;

    const suggested = selectedHeadsetMeta.depositAmount ?? '';
    setForm((prev) => ({
      ...prev,
      depositAmount: prev.depositAmount !== '' ? prev.depositAmount : String(suggested || ''),
    }));
  }, [selectedHeadsetMeta]);

  const onChange = (name, value) => {
    setMessage({ type: '', text: '' });
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.headsetId) return 'Please select a headset.';
    if (!form.agentId) return 'Please select an agent.';
    if (!form.processId) return 'Please select a process.';
    if (!form.depositAmount || Number(form.depositAmount) <= 0) return 'Please enter a valid deposit amount.';
    if (!form.paymentMode) return 'Please select payment mode.';
    if (!form.tlName?.trim()) return 'TL Name is required';
    if (!form.managerName?.trim()) return 'Manager Name is required';
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

      const res = await assignHeadset({
        headset_id: Number(form.headsetId),
        agent_id: Number(form.agentId),
        process_id: Number(form.processId),
        deposit_amount: Number(form.depositAmount),
        payment_mode: form.paymentMode,
        receipt_number: form.receiptNumber?.trim() || undefined,
        notes: form.notes?.trim() || undefined,
        tl_name: form.tlName.trim(),
        manager_name: form.managerName.trim(),
      });

      const payload = res.data;
      const msg = payload?.message || 'Headset assigned successfully.';
      const data = payload?.data || {};

      setMessage({
        type: 'success',
        text: `${msg} (Assignment #${data.assignmentId || 'N/A'}, Receipt: ${data.receiptNumber || 'N/A'})`,
      });
      queueMicrotask(focusAlert);

      // Reset form (keep filters)
      setForm((prev) => ({
        ...prev,
        headsetId: '',
        agentId: '',
        processId: '',
        depositAmount: '',
        paymentMode: 'salary_deduction',
        receiptNumber: '',
        tlName: '',
        managerName: '',
        notes: '',
      }));
      setSelectedHeadsetMeta(null);

      // Refresh agents list (no headset)
      const agRes = await getAgentsForDropdown({ has_headset: 'false' });
      setAgents(agRes.data?.data || []);
    } catch (e2) {
      console.error(e2);
      const serverMsg = e2?.response?.data?.message;
      setMessage({ type: 'error', text: serverMsg || 'Assign failed.' });
      queueMicrotask(focusAlert);
    } finally {
      setSubmitting(false);
    }
  };

  // ✅ Headset async search using getAvailableHeadsets with filters
  const searchAvailableHeadsets = async (q) => {
    const query = String(q || '').trim();

    const res = await getAvailableHeadsets({
      search: query, // allow empty query to show initial list
      headset_type: filter.headsetType === 'all' ? '' : filter.headsetType,
      brand_id: filter.brandId === 'all' ? '' : filter.brandId,
      page: 1,
      limit: 30,
      sort_by: 'headset_number',
      sort_order: 'ASC',
    });

    let rows = res.data?.data || [];

    // ✅ Tier filter client-side (since getAvailableHeadsets may not support it)
    if (filter.tier !== 'all') {
      rows = rows.filter((h) => tierOfHeadsetType(h.headsetType) === filter.tier);
    }

    return rows.map((h) => ({
      value: String(h.id),
      label: `${h.headsetNumber} • ${formatHeadsetType(h.headsetType)}`,
      meta: h,
    }));
  };

  // Type options: from known tiers or from brands? use static set from processes? simplest:
  const headsetTypeOptions = useMemo(() => {
    // Since available list is remote now, keep this list stable:
    // You can extend if you want all supported types.
    return ['all', 'voix_enc', 'voix_2xx', 'voix_3xx', 'voix_nxx', 'voix_xxx', 'tech', 'ojt', 'yjack'];
  }, []);

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
              <i className="bi bi-person-plus" /> Assign Headset
            </h1>
            <p className="as-subtitle">Assign an available headset to an agent (Admin only)</p>
          </div>
        </div>

        {/* Top alert (focus + smooth scroll target) */}
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
            {/* Filters */}
            <div className="as-filters-card">
              <h3>Available Headsets Filter</h3>

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

                {/* ✅ NEW tier filter */}
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
                  Tip: Click headset dropdown to load available headsets. Type to search by number.
                </div>
              </div>
            </div>

            <form className="as-form-card" onSubmit={submit}>
              <h3>Assignment Details</h3>

              <div className="as-grid">
                <div className="as-field">
                  <label>Headset (Available)</label>

                  <SearchableSelect
                    value={form.headsetId}
                    onChange={(v) => {
                      onChange('headsetId', v);

                      // update selected meta (we keep it based on last search result)
                      // SearchableSelect doesn't give opt back, so we set it from cached meta in onSearch results:
                      // easiest: re-search by id? We'll use a lightweight trick: store it from last search list.
                    }}
                    placeholder="Type headset # (available)..."
                    minChars={0}
                    onSearch={async (q) => {
                      const opts = await searchAvailableHeadsets(q);
                      // if current headsetId is in results, sync meta
                      const found = opts.find((o) => String(o.value) === String(form.headsetId));
                      if (found?.meta) setSelectedHeadsetMeta(found.meta);
                      return opts;
                    }}
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

                  {selectedHeadsetMeta && (
                    <div className="as-hint">
                      Deposit suggested: <strong>{selectedHeadsetMeta.depositAmount ?? 'N/A'}</strong> • Refund:{' '}
                      <strong>{selectedHeadsetMeta.refundAmount ?? 'N/A'}</strong>
                    </div>
                  )}
                </div>

                <div className="as-field">
                  <label>Agent (No active headset)</label>

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
                  <label>Process</label>
                  <select className="as-select" value={form.processId} onChange={(e) => onChange('processId', e.target.value)}>
                    <option value="">Select process...</option>
                    {processes.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name} {p.category ? `• ${p.category}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ✅ TL + Manager fields styled consistently */}
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
                  <label>Deposit Amount (editable)</label>
                  <input
                    className="as-input"
                    type="number"
                    min="0"
                    step="1"
                    value={form.depositAmount}
                    onChange={(e) => onChange('depositAmount', e.target.value)}
                    placeholder="e.g. 500"
                  />
                </div>

                <div className="as-field">
                  <label>Payment Mode</label>
                  <select className="as-select" value={form.paymentMode} onChange={(e) => onChange('paymentMode', e.target.value)}>
                    {PAYMENT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="as-field">
                  <label>Receipt Number (optional)</label>
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
                      <span className="as-btn-spinner" /> Assigning...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle" /> Assign Headset
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