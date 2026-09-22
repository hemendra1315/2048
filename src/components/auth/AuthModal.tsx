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
  HelpCircle,
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
    <div className="min-h-screen bg-vault-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-vault-900 border border-vault-700/80 rounded-3xl p-6 shadow-2xl relative backdrop-blur-xl">
        {/* ========================================================================= */}
        {/* 1. LOGIN MODE */}
        {/* ========================================================================= */}
        {mode === 'login' && (
          <div>
            {/* Header */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-arcade-gold to-amber-600 flex items-center justify-center text-vault-950 font-bold shadow-lg shadow-amber-500/20 mb-3">
                <Shield className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Vault Access Gate</h2>
              <p className="text-xs text-vault-400 mt-1">Authenticate via Biometrics or Password</p>
            </div>

            {/* Biometric Quick Trigger (if supported) */}
            {isBiometricsSupported && (
              <div className="mb-5">
                <button
                  type="button"
                  onClick={handleBiometricAuth}
                  disabled={loading}
                  className="w-full bg-vault-800/90 hover:bg-vault-750 border border-arcade-gold/40 hover:border-arcade-gold p-3.5 rounded-2xl flex items-center justify-center gap-3 text-vault-100 transition-all active:scale-98 group shadow-md"
                >
                  <div className="w-9 h-9 rounded-xl bg-arcade-gold/20 flex items-center justify-center text-arcade-gold group-hover:scale-110 transition-transform">
                    <Fingerprint className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-white">Unlock with Fingerprint</div>
                    <div className="text-[10px] text-vault-400">Touch sensor to access Vault</div>
                  </div>
                </button>
              </div>
            )}

            {/* Quick Demo Switcher (local development with the mock backend only) */}
            {import.meta.env.DEV && SHOW_DEMO_ACCOUNTS && (
            <div className="bg-vault-950/80 border border-vault-800 rounded-2xl p-2.5 mb-5 text-center">
              <div className="text-[10px] font-bold text-arcade-gold uppercase tracking-wider mb-2 flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3" /> Quick Switch Identity
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleQuickDemo('user')}
                  className="py-1.5 px-2 bg-vault-800 hover:bg-vault-700 text-xs font-semibold rounded-xl text-vault-200 border border-vault-700 active:scale-95 transition-all"
                >
                  @alex
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('friend')}
                  className="py-1.5 px-2 bg-vault-800 hover:bg-vault-700 text-xs font-semibold rounded-xl text-vault-200 border border-vault-700 active:scale-95 transition-all"
                >
                  @elena
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('admin')}
                  className="py-1.5 px-2 bg-amber-950/80 hover:bg-amber-900 text-xs font-bold rounded-xl text-amber-300 border border-amber-600/50 active:scale-95 transition-all flex items-center justify-center gap-1"
                >
                  <ShieldAlert className="w-3 h-3" /> Admin
                </button>
              </div>
            </div>
            )}

            {/* Password Login Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                  Username or UID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="e.g. alex or CIPHER-4921"
                    className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-vault-300 uppercase tracking-wider">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode('recovery')}
                    className="text-[11px] text-arcade-gold hover:underline flex items-center gap-1"
                  >
                    <HelpCircle className="w-3 h-3" /> Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    maxLength={72}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-vault-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2 mt-2"
              >
                <Lock className="w-4 h-4" />
                <span>Authorize & Enter Vault</span>
              </button>
            </form>

            {/* Toggle & Panic Exit */}
            <div className="mt-5 flex flex-col items-center gap-3 pt-4 border-t border-vault-800">
              <button
                type="button"
                onClick={() => {
                  setMode('onboarding');
                  setOnboardingStep('username');
                }}
                className="text-xs text-vault-400 hover:text-arcade-gold transition-colors"
              >
                First time here? <span className="text-arcade-gold font-semibold">Create Frictionless Account</span>
              </button>

              <button
                type="button"
                onClick={panicLock}
                className="text-[11px] text-rose-400/80 hover:text-rose-300 flex items-center gap-1 transition-colors"
              >
                <Lock className="w-3 h-3" /> Return to Cover Game
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. ONBOARDING MODE (Step-by-Step Frictionless Account Creation) */}
        {/* ========================================================================= */}
        {mode === 'onboarding' && (
          <div>
            {/* Step Progress Bar */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'username' ? 'bg-arcade-gold' : 'bg-vault-700'
                  }`}
                />
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'password' ? 'bg-arcade-gold' : 'bg-vault-700'
                  }`}
                />
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'biometric' ? 'bg-arcade-gold' : 'bg-vault-700'
                  }`}
                />
                <div
                  className={`w-6 h-1.5 rounded-full ${
                    onboardingStep === 'recovery_code' ? 'bg-arcade-gold' : 'bg-vault-700'
                  }`}
                />
              </div>
              <span className="text-[10px] font-bold text-vault-400 uppercase tracking-wider">
                Step {getStepText()}
              </span>
            </div>

            {/* STEP 1: USERNAME */}
            {onboardingStep === 'username' && (
              <form onSubmit={handleUsernameNext}>
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-vault-800 border border-vault-700 flex items-center justify-center text-arcade-gold mb-2">
                    <User className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Choose Your Identity</h3>
                  <p className="text-xs text-vault-400 mt-1">
                    No email needed. Pick a username.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vault-500 font-mono text-sm">
                        @
                      </span>
                      <input
                        type="text"
                        required
                        autoFocus
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                        placeholder="cipher_fox"
                        className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none font-mono"
                      />
                    </div>
                    <p className="text-[10px] text-vault-500 mt-1.5">
                      A unique UID (e.g. CIPHER-4921) will be generated automatically.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-arcade-gold hover:bg-amber-400 text-vault-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2"
                  >
                    <span>Continue to Password Setup</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: PASSWORD */}
            {onboardingStep === 'password' && (
              <form onSubmit={handlePasswordNext}>
                <div className="flex flex-col items-center text-center mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-vault-800 border border-vault-700 flex items-center justify-center text-arcade-gold mb-2">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Create a Password</h3>
                  <p className="text-xs text-vault-400 mt-1">
                    Your personal key to unlock the Vault.
                  </p>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                      Password (min 8 characters)
                    </label>
                    <input
                      type="password"
                      maxLength={72}
                      required
                      autoFocus
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      maxLength={72}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setOnboardingStep('username')}
                      className="w-1/3 bg-vault-800 hover:bg-vault-700 text-vault-300 font-semibold py-3 rounded-xl text-xs transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="w-2/3 bg-arcade-gold hover:bg-amber-400 text-vault-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>Next</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* STEP 3: BIOMETRIC ENROLLMENT */}
            {onboardingStep === 'biometric' && (
              <div>
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="w-14 h-14 rounded-2xl bg-arcade-gold/20 border border-arcade-gold/50 flex items-center justify-center text-arcade-gold mb-3 shadow-lg shadow-amber-500/10">
                    <Fingerprint className="w-7 h-7" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Enable Biometrics?</h3>
                  <p className="text-xs text-vault-400 mt-1">
                    Unlock the Vault instantaneously with your fingerprint or biometric sensor.
                  </p>
                </div>

                <div className="bg-vault-950 border border-vault-800 rounded-2xl p-3 mb-5 text-xs text-vault-300 flex items-start gap-2.5">
                  <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Zero biometric data leaves your device hardware. Secured via platform-grade authenticator.
                  </span>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleBiometricChoice(true)}
                    className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-98 text-vault-950 font-bold py-3.5 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>Enable Fingerprint Unlock</span>
                  </button>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleBiometricChoice(false)}
                    className="w-full bg-vault-800 hover:bg-vault-700 text-vault-300 font-semibold py-2.5 rounded-xl text-xs transition-colors"
                  >
                    Skip for Now (Use Password Only)
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: RECOVERY CODE DISPLAY & ACTIVATION */}
            {onboardingStep === 'recovery_code' && (
              <div>
                <div className="flex flex-col items-center text-center mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-2">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Save Account Recovery Key</h3>
                  <p className="text-xs text-vault-400 mt-1">
                    Store this key securely. It is the <strong className="text-rose-400">ONLY</strong> way to reset your password if forgotten.
                  </p>
                </div>

                {/* Code Card */}
                <div className="bg-vault-950 border-2 border-dashed border-arcade-gold/50 rounded-2xl p-3.5 mb-4 text-center">
                  <div className="text-[10px] uppercase font-bold text-vault-400 tracking-wider mb-1">
                    One-Time Recovery Key
                  </div>
                  <div className="text-base font-mono font-bold text-arcade-gold tracking-wider select-all py-1">
                    {generatedRecoveryCode}
                  </div>
                  <button
                    type="button"
                    onClick={copyRecoveryCode}
                    className="mt-2 text-xs text-vault-300 hover:text-white bg-vault-800 hover:bg-vault-750 px-3 py-1.5 rounded-lg border border-vault-700 inline-flex items-center gap-1.5 transition-colors"
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
                <label className="flex items-start gap-2.5 p-2 bg-vault-950/60 border border-vault-800 rounded-xl mb-4 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hasSavedRecoveryCode}
                    onChange={e => setHasSavedRecoveryCode(e.target.checked)}
                    className="mt-1 rounded accent-arcade-gold"
                  />
                  <span className="text-[11px] text-vault-300 leading-tight">
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
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:pointer-events-none active:scale-98 text-vault-950 font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-500/20 text-sm transition-all flex items-center justify-center gap-2"
                >
                  <span>Enter Retro Vault</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Back to Login Toggle */}
            {onboardingStep !== 'recovery_code' && (
              <div className="mt-5 pt-4 border-t border-vault-800 text-center">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs text-vault-400 hover:text-arcade-gold transition-colors inline-flex items-center gap-1"
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
          <div>
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-arcade-gold mb-2">
                <RefreshCw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Reset Vault Password</h3>
              <p className="text-xs text-vault-400 mt-1">Enter your Recovery Key to set a new password</p>
            </div>

            <form onSubmit={handleRecoverySubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                  Username or UID
                </label>
                <input
                  type="text"
                  required
                  value={recoveryIdent}
                  onChange={e => setRecoveryIdent(e.target.value)}
                  placeholder="e.g. alex or CIPHER-4921"
                  className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                  Recovery Key
                </label>
                <input
                  type="text"
                  required
                  value={recoveryCodeInput}
                  onChange={e => setRecoveryCodeInput(e.target.value.toUpperCase())}
                  placeholder="RC-XXXX-XXXX-XXXX"
                  className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder-vault-600 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                  New Password (min 8 characters)
                </label>
                <input
                  type="password"
                  maxLength={72}
                  required
                  autoComplete="new-password"
                      value={recoveryNewPassword}
                  onChange={e => setRecoveryNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-vault-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2 mt-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>Reset Password & Unlock</span>
              </button>
            </form>

            <div className="mt-5 pt-4 border-t border-vault-800 text-center">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-xs text-vault-400 hover:text-arcade-gold transition-colors inline-flex items-center gap-1"
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
