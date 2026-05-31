import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [form, setForm] = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fromPath = location.state?.from?.pathname || '/dashboard';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.username || !form.password) {
      setError('Please enter username and password');
      return;
    }

	try {
	  setLoading(true);
	  const result = await login(form.username.trim(), form.password);
	  if (result.success) {
	    navigate(fromPath, { replace: true });
	  } else {
	    setError(result.message || 'Login failed');
	  }
	} catch (err) {
	  setError('Login failed. Please try again.');
	} finally {
	  setLoading(false);
	}
  };

  return (
    <div className="login-page">
      <div className="login-overlay" />

      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <i className="bi bi-headphones"></i>
          </div>
          <h1>ABSS Headset Inventory</h1>
          <p>Sign in to continue</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="login-error">
              <i className="bi bi-exclamation-triangle-fill"></i>
              <span>{error}</span>
            </div>
          )}

          <div className="login-field">
            <label>Username / Employee ID</label>
            <div className="login-input-wrap">
              <i className="bi bi-person-fill"></i>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="e.g. IT001"
                autoFocus
              />
            </div>
          </div>

          <div className="login-field">
            <label>Password</label>
            <div className="login-input-wrap">
              <i className="bi bi-lock-fill"></i>
              <input
                type={showPwd ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className="login-pwd-toggle"
                onClick={() => setShowPwd((s) => !s)}
                aria-label="Toggle password"
              >
                <i className={`bi ${showPwd ? 'bi-eye-slash-fill' : 'bi-eye-fill'}`}></i>
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? (
              <>
                <span className="login-spinner" />
                Signing in...
              </>
            ) : (
              <>
                <i className="bi bi-box-arrow-in-right"></i>
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="login-footer">
          <small>© {new Date().getFullYear()} Amii Business Support Solution Pvt Ltd.</small>
        </div>
      </div>
    </div>
  );
};

export default Login;