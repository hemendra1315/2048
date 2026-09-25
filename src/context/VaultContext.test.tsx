import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VaultProvider, useVault } from './VaultContext';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { supabase, isSupabaseConfigured, isMockBackendAllowed } from '../lib/supabase';
import { mockBackend } from '../lib/mockBackend';

// These are the exact seams VaultContext depends on. Mocking them lets us drive every branch
// of verifyAndUnlock/unlockWithBiometric deterministically, without a real network or DOM auth flow.
vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('./ToastContext', () => ({ useToast: vi.fn() }));
vi.mock('../lib/mockBackend', () => ({
  mockBackend: {
    getUserPreferences: vi.fn(() => ({})),
    verifyUnlockSecret: vi.fn(),
  },
}));
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) })) },
  isSupabaseConfigured: vi.fn(),
  isMockBackendAllowed: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseToast = vi.mocked(useToast);
const mockedRpc = vi.mocked(supabase.rpc);
const mockedIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);
const mockedIsMockBackendAllowed = vi.mocked(isMockBackendAllowed);
const mockedVerifyUnlockSecret = vi.mocked(mockBackend.verifyUnlockSecret);

const showToast = vi.fn();
const loginWithBiometrics = vi.fn();

// Small harness: exposes isUnlocked and a button per action so tests can drive the real
// VaultProvider through its public hook, the same way every consumer component does.
function Harness() {
  const { isUnlocked, verifyAndUnlock, unlockWithBiometric } = useVault();
  const [lastResult, setLastResult] = React.useState<string>('');
  return (
    <div>
      <span data-testid="unlocked">{String(isUnlocked)}</span>
      <span data-testid="result">{lastResult}</span>
      <button onClick={async () => setLastResult(String(await verifyAndUnlock('the-secret')))}>verify</button>
      <button onClick={async () => setLastResult(String(await unlockWithBiometric()))}>biometric</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <VaultProvider>
      <Harness />
    </VaultProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseToast.mockReturnValue({ showToast } as unknown as ReturnType<typeof useToast>);
  mockedUseAuth.mockReturnValue({
    user: { id: 'user-1', username: 'alex' },
    loginWithBiometrics,
  } as unknown as ReturnType<typeof useAuth>);
});

describe('VaultContext.verifyAndUnlock', () => {
  describe('when Supabase is configured (real backend)', () => {
    beforeEach(() => {
      mockedIsSupabaseConfigured.mockReturnValue(true);
    });

    it('does NOT unlock when the RPC call itself errors (critical: no insecure fallback)', async () => {
      mockedRpc.mockResolvedValue({ data: null, error: { message: 'network down' } } as never);
      renderHarness();

      await act(async () => {
        await userEvent.click(screen.getByText('verify'));
      });

      expect(screen.getByTestId('unlocked').textContent).toBe('false');
      expect(screen.getByTestId('result').textContent).toBe('false');
      expect(showToast).toHaveBeenCalledWith('Something went wrong. Try again.', 'error');
    });

    it('does NOT unlock on a server-verified wrong PIN', async () => {
      mockedRpc.mockResolvedValue({ data: { ok: false, error: 'invalid' }, error: null } as never);
      renderHarness();

      await act(async () => {
        await userEvent.click(screen.getByText('verify'));
      });

      expect(screen.getByTestId('unlocked').textContent).toBe('false');
      expect(showToast).toHaveBeenCalledWith('Incorrect PIN', 'error');
    });

    it('surfaces the lockout message and stays locked when throttled', async () => {
      const lockedUntil = new Date(Date.now() + 5 * 60_000).toISOString();
      mockedRpc.mockResolvedValue({
        data: { ok: false, error: 'locked', locked_until: lockedUntil },
        error: null,
      } as never);
      renderHarness();

      await act(async () => {
        await userEvent.click(screen.getByText('verify'));
      });

      expect(screen.getByTestId('unlocked').textContent).toBe('false');
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Too many wrong PIN attempts'), 'error');
    });

    it('unlocks only when the RPC explicitly confirms ok: true', async () => {
      mockedRpc.mockResolvedValue({ data: { ok: true }, error: null } as never);
      renderHarness();

      await act(async () => {
        await userEvent.click(screen.getByText('verify'));
      });

      expect(screen.getByTestId('unlocked').textContent).toBe('true');
      expect(screen.getByTestId('result').textContent).toBe('true');
      expect(showToast).toHaveBeenCalledWith('Unlocked', 'success');
    });
  });

  describe('when using the offline mock backend', () => {
    beforeEach(() => {
      mockedIsSupabaseConfigured.mockReturnValue(false);
      mockedIsMockBackendAllowed.mockReturnValue(true);
    });

    it('does not unlock when the mock backend rejects the secret', async () => {
      mockedVerifyUnlockSecret.mockResolvedValue(false);
      renderHarness();

      await act(async () => {
        await userEvent.click(screen.getByText('verify'));
      });

      expect(screen.getByTestId('unlocked').textContent).toBe('false');
      expect(showToast).toHaveBeenCalledWith('Incorrect PIN', 'error');
    });

    it('unlocks when the mock backend accepts the secret', async () => {
      mockedVerifyUnlockSecret.mockResolvedValue(true);
      renderHarness();

      await act(async () => {
        await userEvent.click(screen.getByText('verify'));
      });

      expect(screen.getByTestId('unlocked').textContent).toBe('true');
    });
  });

  describe('when there is no signed-in user (pre-login default PIN)', () => {
    beforeEach(() => {
      mockedIsSupabaseConfigured.mockReturnValue(false);
      mockedUseAuth.mockReturnValue({ user: null, loginWithBiometrics } as unknown as ReturnType<typeof useAuth>);
    });

    it('rejects anything other than the documented default PIN', async () => {
      render(
        <VaultProvider>
          <VerifyWithSecret secret="wrong" />
        </VaultProvider>
      );

      await act(async () => {
        await userEvent.click(screen.getByText('verify'));
      });

      expect(screen.getByTestId('unlocked').textContent).toBe('false');
    });
  });
});

describe('VaultContext.unlockWithBiometric', () => {
  beforeEach(() => {
    mockedIsSupabaseConfigured.mockReturnValue(true);
  });

  it('does NOT unlock when the WebAuthn ceremony fails (critical: no hardware-only bypass)', async () => {
    loginWithBiometrics.mockRejectedValue(new Error('Fingerprint not recognised'));
    renderHarness();

    await act(async () => {
      await userEvent.click(screen.getByText('biometric'));
    });

    expect(screen.getByTestId('unlocked').textContent).toBe('false');
    expect(screen.getByTestId('result').textContent).toBe('false');
  });

  it('unlocks only after a real, server-verified WebAuthn assertion succeeds', async () => {
    loginWithBiometrics.mockResolvedValue({ id: 'user-1' });
    renderHarness();

    await act(async () => {
      await userEvent.click(screen.getByText('biometric'));
    });

    expect(loginWithBiometrics).toHaveBeenCalledWith('alex');
    expect(screen.getByTestId('unlocked').textContent).toBe('true');
    expect(screen.getByTestId('result').textContent).toBe('true');
  });
});

// A small harness variant for the "no user" pre-login PIN check, which needs a fixed secret
// rather than the shared Harness's hardcoded 'the-secret'.
function VerifyWithSecret({ secret }: { secret: string }) {
  const { isUnlocked, verifyAndUnlock } = useVault();
  return (
    <div>
      <span data-testid="unlocked">{String(isUnlocked)}</span>
      <button onClick={() => verifyAndUnlock(secret)}>verify</button>
    </div>
  );
}
