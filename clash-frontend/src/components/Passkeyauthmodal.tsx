/**
 * PasskeyAuthModal.tsx
 *
 * Login / Register flow:
 *   1. User types a username
 *   2. If username exists on-chain  → authenticate via passkey (WebAuthn get)
 *   3. If username is new          → create passkey (WebAuthn create) + call set_username
 *
 * Smart-account / session-key wiring lives in passkeyService.ts so this
 * component stays purely presentational + orchestration.
 */

import { useState, useEffect, useRef } from 'react';
import type { AuthUser } from '@/services/passkeyService';
import './PasskeyAuthModal.css';

interface PasskeyAuthModalProps {
  onSuccess: (user: AuthUser) => void;
  onClose?: () => void;
  /** If true, user cannot dismiss the modal (first-time gate) */
  required?: boolean;
}

type Step = 'username' | 'checking' | 'login' | 'register' | 'processing' | 'success';

export function PasskeyAuthModal({ onSuccess, onClose, required = false }: PasskeyAuthModalProps) {
  const [step,     setStep]     = useState<Step>('username');
  const [username, setUsername] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [hint,     setHint]     = useState<string | null>(null);
  const [user,     setUser]     = useState<AuthUser | null>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // lazy-import so WASM init doesn't block initial render
  const [svc, setSvc] = useState<typeof import('@/services/passkeyService') | null>(null);
  useEffect(() => {
    import('@/services/passkeyService').then(setSvc);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svc) return;
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) { setError('Please enter a username'); return; }
    if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
      setError('3–20 chars, lowercase letters, numbers, underscores only');
      return;
    }

    setError(null);
    setStep('checking');

    try {
      const existingAddress = await svc.resolveUsername(trimmed);
      if (existingAddress) {
        setStep('login');
        setHint(`Welcome back, ${trimmed}! Authenticate with your passkey.`);
      } else {
        setStep('register');
        setHint(`"${trimmed}" is available! Create your pirate identity with a passkey.`);
      }
    } catch {
      setError('Network error. Please try again.');
      setStep('username');
    }
  };

  const handleLogin = async () => {
    if (!svc) return;
    setStep('processing');
    setError(null);
    try {
      const authUser = await svc.loginWithPasskey(username.trim().toLowerCase());
      setUser(authUser);
      setStep('success');
      setTimeout(() => onSuccess(authUser), 900);
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed. Try again.');
      setStep('login');
    }
  };

  const handleRegister = async () => {
    if (!svc) return;
    setStep('processing');
    setError(null);
    try {
      const authUser = await svc.registerWithPasskey(username.trim().toLowerCase());
      setUser(authUser);
      setStep('success');
      setTimeout(() => onSuccess(authUser), 900);
    } catch (err: any) {
      setError(err?.message ?? 'Registration failed. Try again.');
      setStep('register');
    }
  };

  return (
    <div className="pam-backdrop" onClick={required ? undefined : onClose}>
      <div className="pam-container" onClick={e => e.stopPropagation()}>
        {/* Animated background rings */}
        <div className="pam-rings">
          <div className="pam-ring r1" />
          <div className="pam-ring r2" />
          <div className="pam-ring r3" />
        </div>

        {/* Header */}
        <div className="pam-header">
          <div className="pam-skull">☠</div>
          <h2 className="pam-title">Clash of Pirates</h2>
          <p className="pam-subtitle">Prove yourself, Captain</p>
        </div>

        {/* Progress bar */}
        <div className="pam-progress">
          {(['username', 'login', 'success'] as const).map((s, i) => (
            <div key={s} className={`pam-dot ${
              step === 'success' ? 'done' :
              i === 0 ? (step === 'username' || step === 'checking' ? 'active' : 'done') :
              //@ts-ignore
              i === 1 ? (step === 'login' || step === 'register' || step === 'processing' ? 'active' : step === 'success' ? 'done' : '') :
             //@ts-ignore
              step === 'success' ? 'active' : ''
            }`} />
          ))}
        </div>

        {/* Body */}
        <div className="pam-body">

          {/* STEP: username */}
          {step === 'username' && (
            <form onSubmit={handleUsernameSubmit} className="pam-form">
              <div className="pam-field">
                <label className="pam-label">⚓ Your Pirate Name</label>
                <div className="pam-input-row">
                  <input
                    ref={inputRef}
                    className="pam-input"
                    placeholder="captain_redbeard"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError(null); }}
                    maxLength={20}
                    autoComplete="username"
                    spellCheck={false}
                  />
                </div>
                <p className="pam-field-hint">3–20 chars · lowercase · letters, numbers, _</p>
              </div>
              {error && <div className="pam-error">{error}</div>}
              <button type="submit" className="pam-btn primary" disabled={!username.trim()}>
                Set Sail →
              </button>
            </form>
          )}

          {/* STEP: checking */}
          {step === 'checking' && (
            <div className="pam-center">
              <div className="pam-spinner" />
              <p className="pam-status-text">Checking the crew manifest…</p>
            </div>
          )}

          {/* STEP: login */}
          {step === 'login' && (
            <div className="pam-action-panel">
              {hint && <p className="pam-hint success">{hint}</p>}
              {error && <div className="pam-error">{error}</div>}
              <div className="pam-passkey-icon">🔑</div>
              <p className="pam-action-desc">
                Use your device's biometrics or security key to authenticate as <strong>{username}</strong>.
              </p>
              <button className="pam-btn primary" onClick={handleLogin}>
                ⚡ Authenticate with Passkey
              </button>
              <button className="pam-btn ghost" onClick={() => { setStep('username'); setError(null); }}>
                ← Different username
              </button>
            </div>
          )}

          {/* STEP: register */}
          {step === 'register' && (
            <div className="pam-action-panel">
              {hint && <p className="pam-hint info">{hint}</p>}
              {error && <div className="pam-error">{error}</div>}
              <div className="pam-passkey-icon new">🏴‍☠️</div>
              <p className="pam-action-desc">
                Create a passkey for <strong>{username}</strong>. Your device will ask for
                biometrics or a PIN — no passwords required.
              </p>
              <div className="pam-feature-list">
                <div className="pam-feature">✅ No password to remember</div>
                <div className="pam-feature">✅ Phishing-resistant</div>
                <div className="pam-feature">✅ Tied to your on-chain identity</div>
              </div>
              <button className="pam-btn primary" onClick={handleRegister}>
                🏴‍☠️ Claim Username & Create Passkey
              </button>
              <button className="pam-btn ghost" onClick={() => { setStep('username'); setError(null); }}>
                ← Different username
              </button>
            </div>
          )}

          {/* STEP: processing */}
          {step === 'processing' && (
            <div className="pam-center">
              <div className="pam-spinner gold" />
              <p className="pam-status-text">Boarding the ship…</p>
              <p className="pam-status-sub">Your device may ask for biometrics</p>
            </div>
          )}

          {/* STEP: success */}
          {step === 'success' && user && (
            <div className="pam-center">
              <div className="pam-success-icon">⚔️</div>
              <p className="pam-status-text success">Welcome aboard, {user.username}!</p>
              <p className="pam-status-sub">
                {user.address.slice(0, 6)}…{user.address.slice(-4)}
              </p>
            </div>
          )}
        </div>

        {/* Close button if not required */}
        {!required && onClose && (
          <button className="pam-close" onClick={onClose} aria-label="Close">✕</button>
        )}
      </div>
    </div>
  );
}