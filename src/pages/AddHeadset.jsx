import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { addHeadset, getHeadsetBrands } from '../services/headsetService';
import { useAuth } from '../auth/AuthContext';
import './AddHeadset.css';

import {
  formatHeadsetType,
  formatBrandName,
  HEADSET_TYPE_HELP,
  isValidHeadsetNumberForType,
} from '../utils/headsetFormat';

const HEADSET_TYPE_OPTIONS = [
  { value: 'voix_enc', label: formatHeadsetType('voix_enc') },
  { value: 'voix_xxx', label: formatHeadsetType('voix_xxx') },
  { value: 'voix_2xx', label: formatHeadsetType('voix_2xx') },
  { value: 'voix_3xx', label: formatHeadsetType('voix_3xx') },
  { value: 'voix_nxx', label: formatHeadsetType('voix_nxx') },
  { value: 'tech', label: formatHeadsetType('tech') },
  { value: 'ojt', label: formatHeadsetType('ojt') },
  { value: 'yjack', label: formatHeadsetType('yjack') },
];
export default function AddHeadset() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const messageRef = useRef(null);


  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    headset_number: '',
    brand_id: '',
    headset_type: '',
    purchase_date: '',
    warranty_expiry: '',
    notes: '',
  });

  const [image1, setImage1] = useState(null);
  const [image2, setImage2] = useState(null);

  const [preview1, setPreview1] = useState('');
  const [preview2, setPreview2] = useState('');

  const [message, setMessage] = useState({ type: '', text: '' });

  const focusMessage = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageRef.current?.focus({ preventScroll: true });
      });
    });
  };

  useEffect(() => {
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [isAdmin, navigate]);
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const b = await getHeadsetBrands();
        setBrands(b.data?.data || []);
      } catch (e) {
        console.error(e);
        setMessage({ type: 'error', text: 'Failed to load brands.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!image1) return setPreview1('');
    const url = URL.createObjectURL(image1);
    setPreview1(url);
    return () => URL.revokeObjectURL(url);
  }, [image1]);

  useEffect(() => {
    if (!image2) return setPreview2('');
    const url = URL.createObjectURL(image2);
    setPreview2(url);
    return () => URL.revokeObjectURL(url);
  }, [image2]);

  const canSubmit = useMemo(() => {
    return (
      form.headset_number.trim() &&
      form.brand_id &&
      form.headset_type.trim() &&
      image1 &&
      image2
    );
  }, [form, image1, image2]);

  const selectedBrand = useMemo(
    () => brands.find((b) => String(b.id) === String(form.brand_id)) || null,
    [brands, form.brand_id]
  );

  const onChange = (k, v) => {
    setMessage({ type: '', text: '' });
    setForm((p) => ({ ...p, [k]: v }));
  };

  const validate = () => {
    if (!form.headset_type) return 'Please select headset type.';
    if (!form.brand_id) return 'Please select a brand.';

    const { ok, reason } = isValidHeadsetNumberForType(form.headset_number, form.headset_type);
    if (!ok) return reason;

    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) {
      setMessage({ type: 'error', text: 'Please fill required fields and select both images.' });
      return;
    }

    const err = validate();
    if (err) {
      setMessage({ type: 'error', text: err });
      return;
    }

    try {
      setSubmitting(true);

      const { normalized } = isValidHeadsetNumberForType(form.headset_number, form.headset_type);

      const fd = new FormData();
      fd.append('headset_number', normalized);
      fd.append('brand_id', form.brand_id);
      fd.append('headset_type', form.headset_type.trim());
      if (form.purchase_date) fd.append('purchase_date', form.purchase_date);
      if (form.warranty_expiry) fd.append('warranty_expiry', form.warranty_expiry);
      if (form.notes.trim()) fd.append('notes', form.notes.trim());

      fd.append('image1', image1);
      fd.append('image2', image2);

      const res = await addHeadset(fd);
      setMessage({ type: 'success', text: res.data?.message || 'Headset added successfully.' });
      focusMessage();

      // reset
      setForm({
        headset_number: '',
        brand_id: '',
        headset_type: '',
        purchase_date: '',
        warranty_expiry: '',
        notes: '',
      });
      setImage1(null);
      setImage2(null);
    } catch (e) {
      console.error(e);
      setMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Failed to add headset.',
      });
      focusMessage();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ah-container">
      <div className="container ah-content">
        <div className="ah-top-nav">
          <button className="ah-btn-back" onClick={() => navigate('/inventory')} type="button">
            <i className="bi bi-arrow-left" /> Back to Inventory
          </button>
        </div>

        <div className="ah-header-card">
          <h1 className="ah-title">
            <i className="bi bi-plus-circle" /> Add Headset
          </h1>
          <p className="ah-subtitle">Add a new headset with two images (required)</p>
        </div>

        {loading ? (
          <div className="ah-loading">
            <div className="ah-spinner" />
            <p>Loading...</p>
          </div>
        ) : (
          <>
            {message.text && (
              <div
                ref={messageRef}
                tabIndex={-1}
                role="alert"
                aria-live="assertive"
                className={`ah-alert ${message.type}`}
              >
                <i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'}`} />
                <span>{message.text}</span>
              </div>
            )}

            <form className="ah-form-card" onSubmit={submit}>
              <div className="ah-grid">
                <div className="ah-field">
                  <label>Headset Type *</label>
                  <select
                    className="ah-select"
                    value={form.headset_type}
                    onChange={(e) => onChange('headset_type', e.target.value)}
                  >
                    <option value="">Select headset type...</option>
                    {HEADSET_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {form.headset_type && (
                    <small className="ah-hint">{HEADSET_TYPE_HELP[form.headset_type]}</small>
                  )}
                </div>

                <div className="ah-field">
                  <label>Brand *</label>
                  <select
                    className="ah-select"
                    value={form.brand_id}
                    onChange={(e) => onChange('brand_id', e.target.value)}
                  >
                    <option value="">Select brand...</option>
                    {brands.map((b) => (
                      <option key={b.id} value={String(b.id)}>
                        {formatBrandName(b.brand_name)}
                      </option>
                    ))}
                  </select>
                  {selectedBrand && (
                    <small className="ah-hint">
                      Deposit: <strong>{selectedBrand.deposit_amount}</strong> • Refund: <strong>{selectedBrand.refund_amount}</strong>
                    </small>
                  )}
                </div>

                <div className="ah-field">
                  <label>Headset Number *</label>
                  <input
                    className="ah-input"
                    value={form.headset_number}
                    onChange={(e) => onChange('headset_number', e.target.value)}
					placeholder={
					  form.headset_type === 'tech'
					    ? 'e.g. TECH 01 / TECH 9999'
					    : form.headset_type === 'voix_enc'
					      ? 'e.g. ENC 01 / ENC 9999* / ENC R01*'
					      : form.headset_type === 'voix_nxx'
					        ? 'e.g. N1 / N9999'
					        : form.headset_type === 'voix_2xx'
					          ? 'e.g. 200'
					          : form.headset_type === 'voix_3xx'
					            ? 'e.g. 300'
					            : form.headset_type === 'voix_xxx'
					              ? 'e.g. 01 / 199 / 400 / 9999'
					              : form.headset_type === 'ojt'
					                ? 'e.g. OJT 01'
					                : form.headset_type === 'yjack'
					                  ? 'e.g. YJACK 01'
					                  : 'Enter headset number'
					}
                  />
                </div>

                <div className="ah-field">
                  <label>Purchase Date</label>
                  <input
                    className="ah-input"
                    type="date"
                    value={form.purchase_date}
                    onChange={(e) => onChange('purchase_date', e.target.value)}
                  />
                </div>

                <div className="ah-field">
                  <label>Warranty Expiry</label>
                  <input
                    className="ah-input"
                    type="date"
                    value={form.warranty_expiry}
                    onChange={(e) => onChange('warranty_expiry', e.target.value)}
                  />
                </div>

                <div className="ah-field full">
                  <label>Notes</label>
                  <textarea
                    className="ah-textarea"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => onChange('notes', e.target.value)}
                  />
                </div>

                <div className="ah-field">
                  <label>Image 1 (required) *</label>
                  <input
                    className="ah-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImage1(e.target.files?.[0] || null)}
                  />
                  {preview1 && <img className="ah-preview" src={preview1} alt="Preview 1" />}
                </div>

                <div className="ah-field">
                  <label>Image 2 (required) *</label>
                  <input
                    className="ah-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImage2(e.target.files?.[0] || null)}
                  />
                  {preview2 && <img className="ah-preview" src={preview2} alt="Preview 2" />}
                </div>
              </div>

              <div className="ah-actions">
                <button className="ah-submit" type="submit" disabled={!canSubmit || submitting}>
                  {submitting ? (
                    <>
                      <span className="ah-btn-spinner" /> Saving...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle" /> Add Headset
                    </>
                  )}
                </button>

                <button className="ah-cancel" type="button" onClick={() => navigate('/inventory')} disabled={submitting}>
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