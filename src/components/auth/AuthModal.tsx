import React, { useState, useEffect } from 'react';
import {
  Shield,
  Fingerprint,
  Lock,
  User,
  KeyRound,
  CheckCircle2,
  Copy,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useVault } from '../../context/VaultContext';
import { useToast } from '../../context/ToastContext';
import { BiometricService } from '../../lib/biometrics';
import { isSupabaseConfigured } from '../../lib/supabase';

// Demo identities exist only in the offline mock backend used for local UI development.
// They are never rendered in a production build or when a real backend is configured.
// `import.meta.env.DEV` is replaced with `false` at build time, so this UI is stripped from production bundles.
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV && !isSupabaseConfigured();

type AuthMode = 'login' | 'onboarding' | 'recovery';
type OnboardingStep = 'username' | 'password' | 'biometric' | 'recovery_code';

export const AuthModal: React.FC = () => {
  const {
    loginWithPassword,
    loginWithBiometrics,
    registerFrictionless,
    resetPasswordWithRecovery,
    isBiometricsSupported,
    loading,
    recoveryCodeToShow,
    acknowledgeRecoveryCode,
  } = useAuth();
  const { panicLock } = useVault();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthMode>('login');
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('username');

  // Login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [biometricAttempted, setBiometricAttempted] = useState(false);

  // Onboarding form state
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasSavedRecoveryCode, setHasSavedRecoveryCode] = useState(false);
  const [copiedRecoveryCode, setCopiedRecoveryCode] = useState(false);

  // Recovery form state
  const [recoveryIdent, setRecoveryIdent] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [recoveryNewPassword, setRecoveryNewPassword] = useState('');

  // A new recovery key (after sign-up or a reset) is shown before the vault opens.
  const generatedRecoveryCode = recoveryCodeToShow ?? '';
  useEffect(() => {
    if (recoveryCodeToShow) {
      setMode('onboarding');
      setOnboardingStep('recovery_code');
    }
  }, [recoveryCodeToShow]);

  // Prompt for the fingerprint automatically only if this browser enrolled one.
  // The server verifies the signed assertion; a cancelled or failed prompt falls back to the password.
  useEffect(() => {
    if (mode === 'login' && isBiometricsSupported && !biometricAttempted && BiometricService.hasLocalEnrollment()) {
      setBiometricAttempted(true);
      loginWithBiometrics().catch(() => {
        // Fall back gracefully to password input
      });
    }
  }, [mode, isBiometricsSupported, biometricAttempted, loginWithBiometrics]);

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      showToast('Please enter your Username/UID and password', 'error');
      return;
    }
    try {
      await loginWithPassword(identifier, password);
    } catch {
      // Error handled by AuthContext toast
    }
  };

  // Trigger manual biometric authentication
  const handleBiometricAuth = async () => {
    try {
      await loginWithBiometrics(identifier.trim() || undefined);
    } catch {
      // Fallback
    }
  };

  // Quick Demo Account switcher
  const handleQuickDemo = async (role: 'user' | 'admin' | 'friend') => {
    // The mock backend ignores passwords; this path does not exist outside local development.
    if (!SHOW_DEMO_ACCOUNTS) return;
    const demoUser = role === 'admin' ? 'admin' : role === 'friend' ? 'elena' : 'alex';
    setIdentifier(demoUser);
    try {
      await loginWithPassword(demoUser, '');
    } catch {
      // toast shown by AuthContext
    }
  };

  // Step 1: Validate Username -> Move to Password
  const handleUsernameNext = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newUsername.trim().toLowerCase();
    if (clean.length < 2) {
      showToast('Username must be at least 2 characters', 'error');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(clean)) {
      showToast('Username can only contain letters, numbers, and underscores', 'error');
      return;
    }
    setOnboardingStep('password');
  };

  // Step 2: Validate Password -> Move to Biometrics
  const handlePasswordNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (isBiometricsSupported) {
      setOnboardingStep('biometric');
    } else {
      finalizeRegistration(false);
    }
  };

  // Step 3: Biometric choice -> Finalize Registration
  const handleBiometricChoice = (enable: boolean) => {
    finalizeRegistration(enable);
  };

  // Finalize Registration & Show Recovery Code
  const finalizeRegistration = async (biometricPref: boolean) => {
    try {
      const res = await registerFrictionless({
        username: newUsername.trim().toLowerCase(),
        password: newPassword,
        enableBiometrics: biometricPref,
      });
      if (res.recoveryCode) setOnboardingStep('recovery_code');
    } catch {
      // Error handled by AuthContext
    }
  };

  // Copy Recovery Code
  const copyRecoveryCode = () => {
    navigator.clipboard.writeText(generatedRecoveryCode);
    setCopiedRecoveryCode(true);
    showToast('Recovery code copied to clipboard', 'info');
    setTimeout(() => setCopiedRecoveryCode(false), 3000);
  };

  // Handle Recovery Submit
  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryIdent.trim() || !recoveryCodeInput.trim() || !recoveryNewPassword) {
      showToast('Please fill all recovery fields', 'error');
      return;
    }
    if (recoveryNewPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'error');
      return;
    }
    try {
      await resetPasswordWithRecovery(recoveryIdent, recoveryCodeInput, recoveryNewPassword);
    } catch {
      // Handled
    }
  };

  const getStepText = () => {
    if (onboardingStep === 'username') return '1/4';
    if (onboardingStep === 'password') return '2/4';
    if (onboardingStep === 'biometric') return '3/4';
    return '4/4';
  };

  return (
    <div className="min-h-screen bg-vault-950 flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen px-5 pt-3 pb-7 flex flex-col relative">
        <header className="h-[52px] flex items-center -ml-2">
          <button
            type="button"
            className="ib"
            aria-label="Back"
            onClick={() => {
              if (mode === 'login') panicLock();
              else setMode('login');
            }}
          >
            <ArrowLeft className="i" aria-hidden />
          </button>
        </header>

        {/* ========================================================================= */}
        {/* 1. LOGIN MODE */}
        {/* ========================================================================= */}
        {mode === 'login' && (
          <div className="flex flex-col flex-1">
            <div className="flex flex-col gap-2.5 mt-5">
              <span
                aria-hidden="true"
                className="w-12 h-12 rounded-[14px] bg-[#111214] border border-vault-700 grid grid-cols-2 gap-1 p-2"
              >
                <span className="rounded bg-gold" />
                <span className="rounded bg-[#2D3137]" />
                <span className="rounded bg-[#3A3224]" />
                <span className="rounded bg-[#10B981]" />
              </span>
              <h1 className="t-h1 mt-3 mb-0">Sign in</h1>
              <p className="t-sm c2 m-0">Welcome back. Use your username and password, or a passkey.</p>
            </div>

            {/* Quick Demo Switcher (local development with the mock backend only) */}
            {import.meta.env.DEV && SHOW_DEMO_ACCOUNTS && (
              <div className="card p-3 mt-5 flex flex-col gap-2" role="group" aria-label="Demo accounts">
                <span className="t-over flex items-center gap-1"><Sparkles className="w-3 h-3" aria-hidden /> Demo accounts</span>
                <div className="grid grid-cols-3 gap-1.5">
                  <button type="button" onClick={() => handleQuickDemo('user')} className="btn btn-s btn-sm">@alex</button>
                  <button type="button" onClick={() => handleQuickDemo('friend')} className="btn btn-s btn-sm">@elena</button>
                  <button type="button" onClick={() => handleQuickDemo('admin')} className="btn btn-s btn-sm">
                    <ShieldAlert className="w-3.5 h-3.5" aria-hidden /> Admin
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-[18px] mt-7">
              <label className="field">
                <span className="lab">Username or ID</span>
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="Username or ID"
                  className="inp outline-none focus:border-cy"
                />
              </label>
              <label className="field">
                <span className="lab">Password</span>
                <input
                  type="password"
                  maxLength={72}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  className="inp outline-none focus:border-cy"
                />
              </label>
              <button
                type="button"
                onClick={() => setMode('recovery')}
                className="self-end -mt-2.5 min-h-[44px] flex items-center text-sm font-semibold text-cy"
              >
                Forgot password?
              </button>
              <button type="submit" disabled={loading} aria-busy={loading} className="btn btn-p btn-block">
                {loading ? <RefreshCw className="i i-sm animate-spin" aria-hidden /> : null}
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {isBiometricsSupported && (
              <>
                <div className="flex items-center gap-3 my-[22px]" aria-hidden="true">
                  <div className="divider flex-1" />
                  <span className="t-cap">or</span>
                  <div className="divider flex-1" />
                </div>
                <button type="button" onClick={handleBiometricAuth} disabled={loading} className="btn btn-s btn-block">
                  <KeyRound className="i" aria-hidden />
                  Sign in with a passkey
                </button>
              </>
            )}

            <div className="mt-auto pt-8 flex flex-col items-center gap-3.5">
              <p className="t-sm c2 m-0">
                New here?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('onboarding');
                    setOnboardingStep('username');
                  }}
                  className="font-semibold text-cy min-h-[44px]"
                >
                  Create an account
                </button>
              </p>
              <p className="t-cap m-0 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" aria-hidden />
                Your password is never stored on this device.
              </p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. ONBOARDING MODE (Step-by-Step Frictionless Account Creation) */}
        {/* ========================================================================= */}
        {mode === 'onboarding' && (
          <div className="flex flex-col flex-1">
            {/* Step Progress Bar */}
            <div className="flex items-center justify-between mb-5 mt-2">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'username' ? 'bg-gold' : 'bg-[#1E2024]'
                  }`}
                />
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'password' ? 'bg-gold' : 'bg-[#1E2024]'
                  }`}
                />
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'biometric' ? 'bg-gold' : 'bg-[#1E2024]'
                  }`}
                />
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'recovery_code' ? 'bg-gold' : 'bg-[#1E2024]'
                  }`}
                />
              </div>
              <span className="t-over font-mono">
                Step {getStepText()}
              </span>
            </div>

            {/* STEP 1: USERNAME */}
            {onboardingStep === 'username' && (
              <form onSubmit={handleUsernameNext} className="flex flex-col flex-1">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-12 h-12 rounded-[14px] bg-[#111214] border border-vault-700 flex items-center justify-center text-gold mb-3">
                    <User className="w-6 h-6" />
                  </div>
                  <h3 className="t-h2 text-white">Choose Your Identity</h3>
                  <p className="t-sm c2 mt-1">
                    No email or phone required. Pick a handle.
                  </p>
                </div>

                <div className="space-y-4">
                  <label className="field">
                    <span className="lab">Username</span>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vault-400 font-mono text-sm">
                        @
                      </span>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        placeholder="cipher_fox"
                        className="inp pl-8 font-mono outline-none focus:border-cy"
                      />
                    </div>
                    <p className="t-cap mt-1">
                      A unique UID (e.g. CIPHER-4921) will be generated automatically.
                    </p>
                  </label>

                  <button
                    type="submit"
                    className="btn btn-p btn-block gap-2"
                  >
                    <span>Continue to Password</span>
                    <ArrowRight className="i" />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: PASSWORD */}
            {onboardingStep === 'password' && (
              <form onSubmit={handlePasswordNext} className="flex flex-col flex-1">
                <div className="flex flex-col items-center text-center mb-5">
                  <div className="w-12 h-12 rounded-[14px] bg-[#111214] border border-vault-700 flex items-center justify-center text-gold mb-3">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <h3 className="t-h2 text-white">Create a Password</h3>
                  <p className="t-sm c2 mt-1">
                    Your master key to access your private messages.
                  </p>
                </div>

                <div className="space-y-3.5">
                  <label className="field">
                    <span className="lab">Password (min 8 characters)</span>
                    <input
                      type="password"
                      maxLength={72}
                      required
                      autoFocus
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="inp outline-none focus:border-cy"
                    />
                  </label>

                  <label className="field">
                    <span className="lab">Confirm Password</span>
                    <input
                      type="password"
                      maxLength={72}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="inp outline-none focus:border-cy"
                    />
                  </label>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setOnboardingStep('username')}
                      className="btn btn-s w-1/3"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="btn btn-p w-2/3 gap-1.5"
                    >
                      <span>Next</span>
                      <ArrowRight className="i" />
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* STEP 3: BIOMETRIC ENROLLMENT */}
            {onboardingStep === 'biometric' && (
              <div className="flex flex-col flex-1">
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-14 h-14 rounded-[14px] bg-[#111214] border border-vault-700 flex items-center justify-center text-gold mb-3">
                    <Fingerprint className="w-7 h-7" />
                  </div>
                  <h3 className="t-h2 text-white">Enable Passkey / Biometrics?</h3>
                  <p className="t-sm c2 mt-1">
                    Unlock instantaneously with your device sensor.
                  </p>
                </div>

                <div className="card p-3.5 mb-5 text-xs text-vault-300 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Zero biometric data leaves your device hardware. Secured via WebAuthn hardware enclave.
                  </span>
                </div>

                <div className="space-y-2.5 mt-auto">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleBiometricChoice(true)}
                    className="btn btn-p btn-block gap-2"
                  >
                    <Fingerprint className="i" />
                    <span>Enable Biometric Unlock</span>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleBiometricChoice(false)}
                    className="btn btn-s btn-block text-xs"
                  >
                    Skip for Now (Use Password Only)
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: RECOVERY CODE DISPLAY & ACTIVATION */}
            {onboardingStep === 'recovery_code' && (
              <div className="flex flex-col flex-1">
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 rounded-[14px] bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="t-h2 text-white">Save Account Recovery Key</h3>
                  <p className="t-sm c2 mt-1">
                    Store this key securely. It is the <strong className="text-rose-400 font-semibold">ONLY</strong> way to reset your password if forgotten.
                  </p>
                </div>

                {/* Code Card */}
                <div className="card border-dashed border-gold/40 p-4 mb-4 text-center">
                  <div className="t-over mb-1">
                    One-Time Recovery Key
                  </div>
                  <div className="text-base font-mono font-bold text-gold tracking-wider select-all py-1">
                    {generatedRecoveryCode}
                  </div>
                  <button
                    type="button"
                    onClick={copyRecoveryCode}
                    className="btn btn-s btn-sm mt-2 mx-auto gap-1.5"
                  >
                    {copiedRecoveryCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Key
                      </>
                    )}
                  </button>
                </div>

                {/* Confirmation Checkbox */}
                <label className="card p-3 mb-4 flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasSavedRecoveryCode}
                    onChange={e => setHasSavedRecoveryCode(e.target.checked)}
                    className="mt-0.5 rounded accent-gold"
                  />
                  <span className="text-[12px] text-vault-300 leading-tight">
                    I have copied and safely stored my recovery key. I understand it cannot be recovered later.
                  </span>
                </label>

                {/* Finish Button */}
                <button
                  type="button"
                  disabled={!hasSavedRecoveryCode}
                  onClick={() => {
                    setHasSavedRecoveryCode(false);
                    acknowledgeRecoveryCode();
                  }}
                  className="btn btn-p btn-block gap-2 mt-auto"
                >
                  <span>Launch Application</span>
                  <ArrowRight className="i" />
                </button>
              </div>
            )}

            {/* Back to Login Toggle */}
            {onboardingStep !== 'recovery_code' && (
              <div className="mt-5 pt-4 border-t border-vault-800 text-center">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs text-vault-400 hover:text-white transition-colors inline-flex items-center gap-1 min-h-[44px]"
                >
                  <ArrowLeft className="w-3 h-3" /> Already have an account? Sign In
                </button>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. RECOVERY MODE (Reset Password via Recovery Code) */}
        {/* ========================================================================= */}
        {mode === 'recovery' && (
          <div className="flex flex-col flex-1">
            <div className="flex flex-col items-center text-center mb-5 mt-2">
              <div className="w-12 h-12 rounded-[14px] bg-[#111214] border border-vault-700 flex items-center justify-center text-gold mb-2">
                <RefreshCw className="w-6 h-6" />
              </div>
              <h3 className="t-h2 text-white">Reset Vault Password</h3>
              <p className="t-sm c2 mt-1">Enter your Recovery Key to set a new password</p>
            </div>

            <form onSubmit={handleRecoverySubmit} className="flex flex-col gap-3.5">
              <label className="field">
                <span className="lab">Username or UID</span>
                <input
                  type="text"
                  required
                  value={recoveryIdent}
                  onChange={e => setRecoveryIdent(e.target.value)}
                  placeholder="e.g. alex or CIPHER-4921"
                  className="inp outline-none focus:border-cy"
                />
              </label>

              <label className="field">
                <span className="lab">Recovery Key</span>
                <input
                  type="text"
                  required
                  value={recoveryCodeInput}
                  onChange={e => setRecoveryCodeInput(e.target.value.toUpperCase())}
                  placeholder="RC-XXXX-XXXX-XXXX"
                  className="inp font-mono outline-none focus:border-cy"
                />
              </label>

              <label className="field">
                <span className="lab">New Password (min 8 characters)</span>
                <input
                  type="password"
                  maxLength={72}
                  required
                  autoComplete="new-password"
                  value={recoveryNewPassword}
                  onChange={e => setRecoveryNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="inp outline-none focus:border-cy"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-p btn-block gap-2 mt-3"
              >
                <KeyRound className="i" />
                <span>Reset Password & Unlock</span>
              </button>
            </form>

            <div className="mt-auto pt-5 border-t border-vault-800 text-center">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-xs text-vault-400 hover:text-white transition-colors inline-flex items-center gap-1 min-h-[44px]"
              >
                <ArrowLeft className="w-3 h-3" /> Back to Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
