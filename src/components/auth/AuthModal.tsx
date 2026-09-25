import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useVault } from '../../context/VaultContext';
import { useToast } from '../../context/ToastContext';
import { BiometricService } from '../../lib/biometrics';
import { isSupabaseConfigured } from '../../lib/supabase';
import { LoginPanel } from './authModal/LoginPanel';
import { OnboardingPanel, OnboardingStep } from './authModal/OnboardingPanel';
import { RecoveryPanel } from './authModal/RecoveryPanel';

// Demo identities exist only in the offline mock backend used for local UI development.
// They are never rendered in a production build or when a real backend is configured.
// `import.meta.env.DEV` is replaced with `false` at build time, so this UI is stripped from production bundles.
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV && !isSupabaseConfigured();

type AuthMode = 'login' | 'onboarding' | 'recovery';

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

  const [showPassword, setShowPassword] = useState(false);

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

  const toggleShowPassword = () => setShowPassword(s => !s);

  return (
    <div className="min-h-screen bg-vault-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-vault-900 border border-vault-700/80 rounded-3xl p-6 shadow-2xl relative backdrop-blur-xl">
        {mode === 'login' && (
          <LoginPanel
            identifier={identifier}
            setIdentifier={setIdentifier}
            password={password}
            setPassword={setPassword}
            showPassword={showPassword}
            toggleShowPassword={toggleShowPassword}
            loading={loading}
            isBiometricsSupported={isBiometricsSupported}
            showDemoAccounts={SHOW_DEMO_ACCOUNTS}
            onSubmit={handleLoginSubmit}
            onBiometricAuth={handleBiometricAuth}
            onQuickDemo={handleQuickDemo}
            onForgotPassword={() => setMode('recovery')}
            onCreateAccount={() => {
              setMode('onboarding');
              setOnboardingStep('username');
            }}
            onPanicLock={panicLock}
          />
        )}

        {mode === 'onboarding' && (
          <OnboardingPanel
            onboardingStep={onboardingStep}
            newUsername={newUsername}
            setNewUsername={setNewUsername}
            newPassword={newPassword}
            setNewPassword={setNewPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            showPassword={showPassword}
            toggleShowPassword={toggleShowPassword}
            loading={loading}
            hasSavedRecoveryCode={hasSavedRecoveryCode}
            setHasSavedRecoveryCode={setHasSavedRecoveryCode}
            copiedRecoveryCode={copiedRecoveryCode}
            generatedRecoveryCode={generatedRecoveryCode}
            onUsernameNext={handleUsernameNext}
            onPasswordNext={handlePasswordNext}
            onPasswordBack={() => setOnboardingStep('username')}
            onBiometricChoice={handleBiometricChoice}
            onCopyRecoveryCode={copyRecoveryCode}
            onFinish={() => {
              setHasSavedRecoveryCode(false);
              acknowledgeRecoveryCode();
            }}
            onBackToLogin={() => setMode('login')}
          />
        )}

        {mode === 'recovery' && (
          <RecoveryPanel
            recoveryIdent={recoveryIdent}
            setRecoveryIdent={setRecoveryIdent}
            recoveryCodeInput={recoveryCodeInput}
            setRecoveryCodeInput={setRecoveryCodeInput}
            recoveryNewPassword={recoveryNewPassword}
            setRecoveryNewPassword={setRecoveryNewPassword}
            showPassword={showPassword}
            toggleShowPassword={toggleShowPassword}
            loading={loading}
            onSubmit={handleRecoverySubmit}
            onBackToLogin={() => setMode('login')}
          />
        )}
      </div>
    </div>
  );
};
