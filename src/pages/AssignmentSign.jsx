import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';

import {
  getAssignmentDetails,
  getSignatureStatus,
  uploadSignature,
} from '../services/assignmentService';

import { useAuth } from '../auth/AuthContext';
import './AssignmentSign.css';

function dataURLToFile(dataUrl, filename) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mime });
}

export default function AssignmentSign() {
  const { id } = useParams();
  const assignmentId = id;
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  // 1) Agent
  const agentSigRef = useRef(null);
  const [agentName, setAgentName] = useState('');
  const [agentUploadFile, setAgentUploadFile] = useState(null);

  // 2) Admin Executive
  const adminExecSigRef = useRef(null);
  const [adminExecSignerName, setAdminExecSignerName] = useState('');

  // 3) IT Staff
  const itSigRef = useRef(null);
  const [itSignerName, setItSignerName] = useState('');
  const [itUploadFile, setItUploadFile] = useState(null);

  // 4) Manager/TL
  const mtSigRef = useRef(null);
  const [mtRole, setMtRole] = useState('manager'); // 'manager' | 'tl'
  const [mtName, setMtName] = useState('');
  const [mtUploadFile, setMtUploadFile] = useState(null);

  // ✅ Snapshot of "already signed" BEFORE user starts signing (per role)
  // We use this to display "already exists / overwrite" message for all roles,
  // and avoid showing it immediately after the first save (confusing).
  const [roleWasSignedInitially, setRoleWasSignedInitially] = useState({
    agent: false,
    admin_exec: false,
    it_staff: false,
    manager: false,
    tl: false,
  });

  // ✅ Prevent Manager/TL snapshot from being overwritten after saves
  const didInitMtSnapshotRef = useRef(false);

  const refreshStatus = async () => {
    const res = await getSignatureStatus(assignmentId);
    setStatus(res.data?.data || null);
  };

  const loadDetailsAndStatus = async () => {
    const [dRes, sRes] = await Promise.all([
      getAssignmentDetails(assignmentId),
      getSignatureStatus(assignmentId),
    ]);

    const d = dRes.data?.data || null;
    const s = sRes.data?.data || null;

    setDetails(d);
    setStatus(s);

    if (d?.agent_name) setAgentName(d.agent_name);
    setAdminExecSignerName((prev) => prev || user?.name || '');

    const st = s?.status || {};
    setRoleWasSignedInitially({
      agent: !!st.agent,
      admin_exec: !!st.admin_exec,
      it_staff: !!st.it_staff,
      manager: !!st.manager,
      tl: !!st.tl,
    });
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) navigate('/dashboard', { replace: true });
  }, [authLoading, isAdmin, navigate]);

  useEffect(() => {
    // reset on assignment change so we never show stale info
    didInitMtSnapshotRef.current = false;
    setStatus(null);
    setDetails(null);
    setMessage({ type: '', text: '' });
    setRoleWasSignedInitially({
      agent: false,
      admin_exec: false,
      it_staff: false,
      manager: false,
      tl: false,
    });

    (async () => {
      try {
        setLoading(true);
        await loadDetailsAndStatus();
      } catch (e) {
        console.error(e);
        setMessage({ type: 'error', text: 'Failed to load assignment/signature details.' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // Auto-fill manager/tl name from assignment details (read-only)
  useEffect(() => {
    if (!details) return;
    if (mtRole === 'manager') setMtName(details.manager_name || '');
    if (mtRole === 'tl') setMtName(details.tl_name || '');
  }, [mtRole, details]);

  // ✅ Initialize Manager/TL "already existed" snapshot only once (first load).
  // Do NOT re-sync after saves, otherwise the "already exists" banner reappears immediately after saving.
  useEffect(() => {
    if (didInitMtSnapshotRef.current) return;
    const st = status?.status;
    if (!st) return;

    didInitMtSnapshotRef.current = true;

    setRoleWasSignedInitially((prev) => ({
      ...prev,
      manager: !!st.manager,
      tl: !!st.tl,
    }));
  }, [status]);

  const isCompleteForPdf = !!status?.isCompleteForPdf;

  const clearPad = (ref) => {
    if (ref?.current) ref.current.clear();
  };

  const buildFileFromPad = (ref, filename) => {
    if (!ref?.current || ref.current.isEmpty()) return null;
    const canvas = ref.current.getCanvas();
    const dataUrl = canvas.toDataURL('image/png');
    return dataURLToFile(dataUrl, filename);
  };

  const submitSignature = async ({ signer_role, signer_name, fileFromUpload, padRef }) => {
    try {
      setMessage({ type: '', text: '' });

      const file =
        fileFromUpload ||
        buildFileFromPad(padRef, `signature_${signer_role}_${assignmentId}.png`);

      if (!file) {
        setMessage({ type: 'error', text: 'Please draw a signature or upload an image file.' });
        return;
      }

      if (!signer_name?.trim()) {
        setMessage({ type: 'error', text: 'Signer name is required.' });
        return;
      }

      await uploadSignature({
        assignmentId,
        signer_role,
        signer_name: signer_name.trim(),
        file,
      });

      setMessage({ type: 'success', text: `Signature saved for ${signer_role}` });

      if (padRef) clearPad(padRef);
      if (signer_role === 'agent') setAgentUploadFile(null);
      if (signer_role === 'it_staff') setItUploadFile(null);
      if (signer_role === 'manager' || signer_role === 'tl') setMtUploadFile(null);

      await refreshStatus();

      // ✅ Important: after a successful save, do NOT show "already exists" banner
      // (the banner is meant to say "it existed before you came here")
      setRoleWasSignedInitially((prev) => ({ ...prev, [signer_role]: false }));
    } catch (e) {
      console.error(e);
      setMessage({
        type: 'error',
        text: e?.response?.data?.message || 'Failed to upload signature.',
      });
    }
  };

  const showAlreadyExists = (role) => !!roleWasSignedInitially?.[role];

  // For section 4 the selected role is mtRole
  const showMtAlreadyExistsBanner = useMemo(() => showAlreadyExists(mtRole), [mtRole, roleWasSignedInitially]);

  return (
    <div className="assign-sign-container">
      <div className="assign-sign-content">

        {/* ── Header card ── */}
        <div className="assign-sign-header-card">
          <div className="assign-sign-header-left">
            <h1 className="assign-sign-title">
              <i className="bi bi-pen" /> Collect Signatures — Assignment #{assignmentId}
            </h1>
            <p className="assign-sign-subtitle">
              Required: Agent + Admin Executive + IT Staff + (Manager OR TL).
              Deposit PDF is enabled only after completion + permanent employee ID.
            </p>
          </div>
          <div className="assign-sign-header-actions">
            <button className="assign-sign-btn secondary" onClick={() => navigate('/pending')} type="button">
              ← Back to Pending
            </button>
            <button className="assign-sign-btn" onClick={refreshStatus} type="button">
              <i className="bi bi-arrow-clockwise" /> Refresh
            </button>
          </div>
        </div>

        {/* ── Global alert ── */}
        {message.text && (
          <div className={`assign-sign-alert ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* ── Loading state ── */}
        {(authLoading || loading) ? (
          <div className="assign-sign-loading">
            <div className="assign-sign-spinner" />
            <p>Loading assignment details…</p>
          </div>
        ) : (
          <>
            {/* ── Status + meta card ── */}
            <div className="assign-sign-card">
              <h2 className="assign-sign-card-title">
                <i className="bi bi-info-circle" /> Assignment Overview
              </h2>

              {details && (
                <div className="assign-sign-meta">
                  <div><b>Agent:</b> {details.agent_name} ({details.employee_id || 'N/A'})</div>
                  <div><b>Headset:</b> {details.headset_number} ({details.headset_type})</div>
                  <div><b>TL:</b> {details.tl_name}</div>
                  <div><b>Manager:</b> {details.manager_name}</div>
                </div>
              )}

              <div className="assign-sign-status-row" style={{ marginTop: 12 }}>
                <span className={`assign-sign-pill ${status?.status?.agent ? 'ok' : 'bad'}`}>
                  {status?.status?.agent ? '✓' : '✗'} Agent
                </span>
                <span className={`assign-sign-pill ${status?.status?.admin_exec ? 'ok' : 'bad'}`}>
                  {status?.status?.admin_exec ? '✓' : '✗'} Admin Exec
                </span>
                <span className={`assign-sign-pill ${status?.status?.it_staff ? 'ok' : 'bad'}`}>
                  {status?.status?.it_staff ? '✓' : '✗'} IT Staff
                </span>
                <span className={`assign-sign-pill ${status?.status?.manager ? 'ok' : 'bad'}`}>
                  {status?.status?.manager ? '✓' : '✗'} Manager
                </span>
                <span className={`assign-sign-pill ${status?.status?.tl ? 'ok' : 'bad'}`}>
                  {status?.status?.tl ? '✓' : '✗'} TL
                </span>
                <span className={`assign-sign-pill ${isCompleteForPdf ? 'ok' : 'warn'}`}>
                  <i className={`bi ${isCompleteForPdf ? 'bi-file-earmark-check' : 'bi-file-earmark-x'}`} />
                  PDF Ready: {isCompleteForPdf ? 'YES' : 'NO'}
                </span>
              </div>
            </div>

            {/* ── 1) Agent Signature ── */}
            <div className="assign-sign-card">
              <h2 className="assign-sign-card-title">
                <i className="bi bi-person" /> 1) Agent Signature
              </h2>

              {showAlreadyExists('agent') && (
                <div className="assign-sign-alert info">
                  Agent signature already exists. You can still overwrite by saving again.
                </div>
              )}

              <div className="assign-sign-row">
                <div className="assign-sign-field">
                  <label>Agent Name *</label>
                  <input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Agent name"
                  />
                </div>
                <div className="assign-sign-field">
                  <label>Upload Signature (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAgentUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div className="assign-sign-pad-wrap">
                <SignatureCanvas ref={agentSigRef} penColor="black" canvasProps={{ className: 'assign-sign-pad' }} />
                <div className="assign-sign-pad-actions">
                  <button type="button" className="assign-sign-btn small secondary" onClick={() => clearPad(agentSigRef)}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="assign-sign-btn small primary"
                    onClick={() =>
                      submitSignature({
                        signer_role: 'agent',
                        signer_name: agentName,
                        fileFromUpload: agentUploadFile,
                        padRef: agentSigRef,
                      })
                    }
                  >
                    Save Agent Signature
                  </button>
                </div>
              </div>
            </div>

            {/* ── 2) Admin Executive Signature ── */}
            <div className="assign-sign-card">
              <h2 className="assign-sign-card-title">
                <i className="bi bi-person-badge" /> 2) Admin Executive Signature
              </h2>

              {showAlreadyExists('admin_exec') && (
                <div className="assign-sign-alert info">
                  Admin Executive signature already exists. You can still overwrite by saving again.
                </div>
              )}

              <div className="assign-sign-row">
                <div className="assign-sign-field">
                  <label>Admin Executive Name *</label>
                  <input
                    value={adminExecSignerName}
                    onChange={(e) => setAdminExecSignerName(e.target.value)}
                    placeholder="Admin Executive name"
                  />
                </div>
              </div>

              <div className="assign-sign-pad-wrap">
                <SignatureCanvas ref={adminExecSigRef} penColor="black" canvasProps={{ className: 'assign-sign-pad' }} />
                <div className="assign-sign-pad-actions">
                  <button type="button" className="assign-sign-btn small secondary" onClick={() => clearPad(adminExecSigRef)}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="assign-sign-btn small primary"
                    onClick={() =>
                      submitSignature({
                        signer_role: 'admin_exec',
                        signer_name: adminExecSignerName,
                        fileFromUpload: null,
                        padRef: adminExecSigRef,
                      })
                    }
                  >
                    Save Admin Exec Signature
                  </button>
                </div>
              </div>
            </div>

            {/* ── 3) IT Staff Signature ── */}
            <div className="assign-sign-card">
              <h2 className="assign-sign-card-title">
                <i className="bi bi-laptop" /> 3) IT Staff Signature
              </h2>

              {showAlreadyExists('it_staff') && (
                <div className="assign-sign-alert info">
                  IT Staff signature already exists. You can still overwrite by saving again.
                </div>
              )}

              <div className="assign-sign-row">
                <div className="assign-sign-field">
                  <label>IT Staff Name *</label>
                  <input
                    value={itSignerName}
                    onChange={(e) => setItSignerName(e.target.value)}
                    placeholder="IT Staff name"
                  />
                </div>
                <div className="assign-sign-field">
                  <label>Upload Signature (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setItUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div className="assign-sign-pad-wrap">
                <SignatureCanvas ref={itSigRef} penColor="black" canvasProps={{ className: 'assign-sign-pad' }} />
                <div className="assign-sign-pad-actions">
                  <button type="button" className="assign-sign-btn small secondary" onClick={() => clearPad(itSigRef)}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="assign-sign-btn small primary"
                    onClick={() =>
                      submitSignature({
                        signer_role: 'it_staff',
                        signer_name: itSignerName,
                        fileFromUpload: itUploadFile,
                        padRef: itSigRef,
                      })
                    }
                  >
                    Save IT Staff Signature
                  </button>
                </div>
              </div>
            </div>

            {/* ── 4) Manager OR TL Signature ── */}
            <div className="assign-sign-card">
              <h2 className="assign-sign-card-title">
                <i className="bi bi-person-check" /> 4) Manager OR TL Signature
              </h2>

              {showMtAlreadyExistsBanner && (
                <div className="assign-sign-alert info">
                  {mtRole === 'manager'
                    ? 'Manager signature already exists. You can still overwrite by saving again.'
                    : 'TL signature already exists. You can still overwrite by saving again.'}
                </div>
              )}

              <div className="assign-sign-row">
                <div className="assign-sign-field">
                  <label>Signer Role *</label>
                  <select value={mtRole} onChange={(e) => setMtRole(e.target.value)}>
                    <option value="manager">Manager</option>
                    <option value="tl">TL</option>
                  </select>
                </div>

                <div className="assign-sign-field">
                  <label>{mtRole === 'manager' ? 'Manager Name *' : 'TL Name *'}</label>
                  <input value={mtName} disabled />
                </div>

                <div className="assign-sign-field">
                  <label>Upload Signature (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setMtUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div className="assign-sign-pad-wrap">
                <SignatureCanvas ref={mtSigRef} penColor="black" canvasProps={{ className: 'assign-sign-pad' }} />
                <div className="assign-sign-pad-actions">
                  <button type="button" className="assign-sign-btn small secondary" onClick={() => clearPad(mtSigRef)}>
                    Clear
                  </button>
                  <button
                    type="button"
                    className="assign-sign-btn small primary"
                    onClick={() =>
                      submitSignature({
                        signer_role: mtRole,
                        signer_name: mtName,
                        fileFromUpload: mtUploadFile,
                        padRef: mtSigRef,
                      })
                    }
                  >
                    Save {mtRole === 'manager' ? 'Manager' : 'TL'} Signature
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}