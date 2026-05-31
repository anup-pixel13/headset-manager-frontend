import React from 'react';
import { useAuth } from '../auth/AuthContext';
import './SessionExpiringModal.css';

const SessionExpiringModal = () => {
  const { sessionExpiring, extendSession, logout } = useAuth();

  if (!sessionExpiring) return null;

  const handleExtend = async () => {
    await extendSession();
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="session-modal-overlay">
      <div className="session-modal">
        <div className="session-modal-icon">
          <i className="bi bi-exclamation-triangle-fill"></i>
        </div>
        <h2>Session Expiring Soon</h2>
        <p>Your session will expire in less than 5 minutes due to inactivity.</p>
        <p>Do you want to stay logged in?</p>
        <div className="session-modal-actions">
          <button className="session-btn-extend" onClick={handleExtend} type="button">
            <i className="bi bi-arrow-clockwise"></i>
            Stay Logged In
          </button>
          <button className="session-btn-logout" onClick={handleLogout} type="button">
            <i className="bi bi-box-arrow-right"></i>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiringModal;