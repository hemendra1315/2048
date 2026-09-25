import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { supabase, isSupabaseConfigured, callVaultAuth } from '../lib/supabase';
import { BiometricService } from '../lib/biometrics';

// AuthContext's central security guarantee: a Supabase session alone is never enough to be
// "signed in" - the UI identity must come back from a readable, active public.profiles row.
// These mocks let us drive that boundary directly instead of standing up a real backend.
vi.mock('./ToastContext', () => ({ useToast: vi.fn() }));
vi.mock('../lib/mockBackend', () => ({
  mockBackend: {
    subscribe: vi.fn(() => () => {}),
    getCurrentUser: vi.fn(() => null),
  },
}));
vi.mock('../lib/biometrics', () => ({
  BiometricService: {
    isAvailable: vi.fn(() => Promise.resolve({ available: false, platform: 'none' })),
    getAssertion: vi.fn(),
    createCredential: vi.fn(),
    setLocalEnrollment: vi.fn(),
    hasLocalEnrollment: vi.fn(() => false),
  },
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      setSession: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
  isSupabaseConfigured: vi.fn(),
  isMockBackendAllowed: vi.fn(() => false),
  callVaultAuth: vi.fn(),
}));

const mockedUseToast = vi.mocked(useToast);
const mockedIsSupabaseConfigured = vi.mocked(isSupabaseConfigured);
const mockedCallVaultAuth = vi.mocked(callVaultAuth);
const mockedGetAssertion = vi.mocked(BiometricService.getAssertion);

const showToast = vi.fn();

// Builds a chainable supabase.from(...).select(...).eq(...).single() mock returning the given result.
function fromSingleResult(result: { data: unknown; error: unknown }) {
  return vi.fn(() => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve(result),
      }),
    }),
  }));
}

function Harness() {
  const { user, loading, loginWithPassword, loginWithBiometrics } = useAuth();
  const [error, setError] = React.useState('');
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.id : 'none'}</span>
      <span data-testid="error">{error}</span>
      <button
        onClick={async () => {
          try {
            await loginWithPassword('alex', 'password123');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'failed');
          }
        }}
      >
        login-password
      </button>
      <button
        onClick={async () => {
          try {
            await loginWithBiometrics('alex');
          } catch (e) {
            setError(e instanceof Error ? e.message : 'failed');
          }
        }}
      >
        login-biometric
      </button>
    </div>
  );
}

function renderHarness() {
  return render(
    <AuthProvider>
      <Harness />
    </AuthProvider>
  );
}

const activeProfile = {
  id: 'user-1',
  uid: 'CIPHER-1',
  username: 'alex',
  display_name: 'Alex',
  status: 'active',
  role: 'user',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseToast.mockReturnValue({ showToast } as unknown as ReturnType<typeof useToast>);
  mockedIsSupabaseConfigured.mockReturnValue(true);
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
});

describe('AuthContext session bootstrap', () => {
  it('never signs a user in from a session alone - it must load an active profile row', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    } as never);
    // Profile row genuinely missing (RLS hides it, or it was never created).
    vi.mocked(supabase.from).mockImplementation(
      fromSingleResult({ data: null, error: { code: 'PGRST116' } }) as never
    );

    renderHarness();

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('signs out and refuses to load a suspended account even with a valid session', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    } as never);
    vi.mocked(supabase.from).mockImplementation(
      fromSingleResult({ data: { ...activeProfile, status: 'suspended' }, error: null }) as never
    );

    renderHarness();

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('suspended'), 'error');
  });

  it('loads the user once a real, active profile row is readable', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
    } as never);
    vi.mocked(supabase.from).mockImplementation(
      fromSingleResult({ data: activeProfile, error: null }) as never
    );

    renderHarness();

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('user-1'));
  });
});

describe('AuthContext.loginWithPassword', () => {
  it('does not sign the user in if the post-login profile fetch comes back empty', async () => {
    mockedCallVaultAuth.mockResolvedValue({
      session: { access_token: 'a', refresh_token: 'b' },
      profile: { id: 'user-1' },
    } as never);
    vi.mocked(supabase.auth.setSession).mockResolvedValue({ error: null } as never);
    // adoptSession's follow-up read finds nothing (e.g. RLS mismatch) - must not adopt the session as "signed in".
    vi.mocked(supabase.from).mockImplementation(fromSingleResult({ data: null, error: null }) as never);

    renderHarness();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      await userEvent.click(screen.getByText('login-password'));
    });

    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(screen.getByTestId('error').textContent).toContain('Could not load your profile');
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('signs the user in once vault-auth and the profile fetch both succeed', async () => {
    mockedCallVaultAuth.mockResolvedValue({
      session: { access_token: 'a', refresh_token: 'b' },
      profile: { id: 'user-1' },
    } as never);
    vi.mocked(supabase.auth.setSession).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.from).mockImplementation(fromSingleResult({ data: activeProfile, error: null }) as never);

    renderHarness();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      await userEvent.click(screen.getByText('login-password'));
    });

    expect(screen.getByTestId('user').textContent).toBe('user-1');
  });
});

describe('AuthContext.loginWithBiometrics', () => {
  it('propagates a cancelled/failed WebAuthn ceremony instead of silently signing in', async () => {
    mockedCallVaultAuth.mockResolvedValueOnce({ publicKey: {} } as never); // webauthn-login-options
    mockedGetAssertion.mockRejectedValue(new Error('Fingerprint check was cancelled'));

    renderHarness();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      await userEvent.click(screen.getByText('login-biometric'));
    });

    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(screen.getByTestId('error').textContent).toContain('cancelled');
    // The server-verify step must never be reached without a real signed assertion.
    expect(mockedCallVaultAuth).not.toHaveBeenCalledWith('webauthn-login-verify', expect.anything());
  });

  it('signs in once the server verifies a real WebAuthn assertion', async () => {
    mockedCallVaultAuth
      .mockResolvedValueOnce({ publicKey: {} } as never) // webauthn-login-options
      .mockResolvedValueOnce({
        session: { access_token: 'a', refresh_token: 'b' },
        profile: { id: 'user-1' },
      } as never); // webauthn-login-verify
    mockedGetAssertion.mockResolvedValue({ id: 'cred-1' } as never);
    vi.mocked(supabase.auth.setSession).mockResolvedValue({ error: null } as never);
    vi.mocked(supabase.from).mockImplementation(fromSingleResult({ data: activeProfile, error: null }) as never);

    renderHarness();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    await act(async () => {
      await userEvent.click(screen.getByText('login-biometric'));
    });

    expect(screen.getByTestId('user').textContent).toBe('user-1');
  });
});
