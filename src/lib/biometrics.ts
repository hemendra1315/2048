// Platform biometric authentication (fingerprint / Face ID / Windows Hello) via WebAuthn.
//
// The browser only runs the ceremony. Challenges come from the vault-auth Edge Function, and the
// signed results go back to it for verification. Nothing here decides whether a login succeeded.

import { expectExternalActivity } from './externalActivity';

export interface BiometricAvailability {
  available: boolean;
  platform: 'webauthn' | 'none';
  error?: string;
}

export interface RegistrationCredential {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  publicKey: string;
  publicKeyAlgorithm: number;
}

export interface AssertionCredential {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle: string | null;
}

interface ServerDescriptor {
  type: 'public-key';
  id: string;
}

export interface ServerCreationOptions {
  challenge: string;
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  attestation?: AttestationConveyancePreference;
  timeout?: number;
  excludeCredentials?: ServerDescriptor[];
}

export interface ServerRequestOptions {
  challenge: string;
  rpId: string;
  userVerification?: UserVerificationRequirement;
  timeout?: number;
  allowCredentials?: ServerDescriptor[];
}

const ENROLLED_KEY = 'vault_biometric_enrolled';

function toB64url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(value: string): ArrayBuffer {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

const toDescriptors = (list?: ServerDescriptor[]): PublicKeyCredentialDescriptor[] | undefined =>
  list?.map(d => ({ type: 'public-key', id: fromB64url(d.id) }));

export class BiometricService {
  static async isAvailable(): Promise<BiometricAvailability> {
    try {
      if (
        typeof window !== 'undefined' &&
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
        (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
      ) {
        return { available: true, platform: 'webauthn' };
      }
      return { available: false, platform: 'none', error: 'No biometric hardware detected' };
    } catch (err) {
      return { available: false, platform: 'none', error: err instanceof Error ? err.message : 'Biometric check failed' };
    }
  }

  /** Whether this browser has enrolled a fingerprint credential (used only to decide whether to auto-prompt). */
  static hasLocalEnrollment(): boolean {
    try {
      return localStorage.getItem(ENROLLED_KEY) === '1';
    } catch {
      return false;
    }
  }

  static setLocalEnrollment(enrolled: boolean): void {
    try {
      if (enrolled) localStorage.setItem(ENROLLED_KEY, '1');
      else localStorage.removeItem(ENROLLED_KEY);
    } catch {
      // storage unavailable
    }
  }

  /** Runs the enrollment ceremony for server-issued options. */
  static async createCredential(options: ServerCreationOptions): Promise<RegistrationCredential> {
    expectExternalActivity();
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: fromB64url(options.challenge),
        rp: options.rp,
        user: { ...options.user, id: fromB64url(options.user.id) },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        attestation: options.attestation ?? 'none',
        timeout: options.timeout,
        excludeCredentials: toDescriptors(options.excludeCredentials),
      },
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('Fingerprint enrollment was cancelled');

    const response = credential.response as AuthenticatorAttestationResponse;
    const publicKey = response.getPublicKey?.();
    const algorithm = response.getPublicKeyAlgorithm?.();
    if (!publicKey || typeof algorithm !== 'number') {
      throw new Error('This browser cannot enroll fingerprint unlock');
    }
    return {
      id: toB64url(credential.rawId),
      clientDataJSON: toB64url(response.clientDataJSON),
      authenticatorData: toB64url(response.getAuthenticatorData()),
      publicKey: toB64url(publicKey),
      publicKeyAlgorithm: algorithm,
    };
  }

  /** Runs the login ceremony for a server-issued challenge and returns the signed assertion. */
  static async getAssertion(options: ServerRequestOptions): Promise<AssertionCredential> {
    expectExternalActivity();
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: fromB64url(options.challenge),
        rpId: options.rpId,
        userVerification: options.userVerification ?? 'required',
        timeout: options.timeout,
        allowCredentials: options.allowCredentials?.length ? toDescriptors(options.allowCredentials) : undefined,
      },
    })) as PublicKeyCredential | null;
    if (!credential) throw new Error('Fingerprint check was cancelled');

    const response = credential.response as AuthenticatorAssertionResponse;
    return {
      id: toB64url(credential.rawId),
      clientDataJSON: toB64url(response.clientDataJSON),
      authenticatorData: toB64url(response.authenticatorData),
      signature: toB64url(response.signature),
      userHandle: response.userHandle ? toB64url(response.userHandle) : null,
    };
  }
}
