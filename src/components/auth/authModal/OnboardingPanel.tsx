import React from 'react';
import {
  User,
  KeyRound,
  Fingerprint,
  Shield,
  CheckCircle2,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
} from 'lucide-react';

export type OnboardingStep = 'username' | 'password' | 'biometric' | 'recovery_code';

interface OnboardingPanelProps {
  onboardingStep: OnboardingStep;
  newUsername: string;
  setNewUsername: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  loading: boolean;
  hasSavedRecoveryCode: boolean;
  setHasSavedRecoveryCode: (value: boolean) => void;
  copiedRecoveryCode: boolean;
  generatedRecoveryCode: string;
  onUsernameNext: (e: React.FormEvent) => void;
  onPasswordNext: (e: React.FormEvent) => void;
  onPasswordBack: () => void;
  onBiometricChoice: (enable: boolean) => void;
  onCopyRecoveryCode: () => void;
  onFinish: () => void;
  onBackToLogin: () => void;
}

const getStepText = (step: OnboardingStep): string => {
  if (step === 'username') return '1/4';
  if (step === 'password') return '2/4';
  if (step === 'biometric') return '3/4';
  return '4/4';
};

export const OnboardingPanel: React.FC<OnboardingPanelProps> = ({
  onboardingStep,
  newUsername,
  setNewUsername,
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  toggleShowPassword,
  loading,
  hasSavedRecoveryCode,
  setHasSavedRecoveryCode,
  copiedRecoveryCode,
  generatedRecoveryCode,
  onUsernameNext,
  onPasswordNext,
  onPasswordBack,
  onBiometricChoice,
  onCopyRecoveryCode,
  onFinish,
  onBackToLogin,
}) => (
  <div>
    {/* Step Progress Bar */}
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-1.5">
        <div className={`w-6 h-1.5 rounded-full ${onboardingStep === 'username' ? 'bg-arcade-gold' : 'bg-vault-700'}`} />
        <div className={`w-6 h-1.5 rounded-full ${onboardingStep === 'password' ? 'bg-arcade-gold' : 'bg-vault-700'}`} />
        <div className={`w-6 h-1.5 rounded-full ${onboardingStep === 'biometric' ? 'bg-arcade-gold' : 'bg-vault-700'}`} />
        <div
          className={`w-6 h-1.5 rounded-full ${onboardingStep === 'recovery_code' ? 'bg-arcade-gold' : 'bg-vault-700'}`}
        />
      </div>
      <span className="text-[10px] font-bold text-vault-400 uppercase tracking-wider">
        Step {getStepText(onboardingStep)}
      </span>
    </div>

    {/* STEP 1: USERNAME */}
    {onboardingStep === 'username' && (
      <form onSubmit={onUsernameNext}>
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-vault-800 border border-vault-700 flex items-center justify-center text-arcade-gold mb-2">
            <User className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Choose Your Identity</h3>
          <p className="text-xs text-vault-400 mt-1">No email needed. Pick a username.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-vault-500 font-mono text-sm">@</span>
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
      <form onSubmit={onPasswordNext}>
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-2xl bg-vault-800 border border-vault-700 flex items-center justify-center text-arcade-gold mb-2">
            <KeyRound className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Create a Password</h3>
          <p className="text-xs text-vault-400 mt-1">Your personal key to unlock the Vault.</p>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
              Password (min 8 characters)
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                maxLength={72}
                required
                autoFocus
                autoComplete="new-password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-white outline-none"
              />
              <button
                type="button"
                onClick={toggleShowPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-vault-500 hover:text-vault-200 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
              Confirm Password
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
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
              onClick={onPasswordBack}
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
          <span>Zero biometric data leaves your device hardware. Secured via platform-grade authenticator.</span>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={() => onBiometricChoice(true)}
            className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-98 text-vault-950 font-bold py-3.5 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2"
          >
            <Fingerprint className="w-4 h-4" />
            <span>Enable Fingerprint Unlock</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => onBiometricChoice(false)}
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
            Store this key securely. It is the <strong className="text-rose-400">ONLY</strong> way to reset your
            password if forgotten.
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
            onClick={onCopyRecoveryCode}
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
          onClick={onFinish}
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
          onClick={onBackToLogin}
          className="text-xs text-vault-400 hover:text-arcade-gold transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3 h-3" /> Already have an account? Sign In
        </button>
      </div>
    )}
  </div>
);
