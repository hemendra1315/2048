// Platform Biometric Authentication Service
// Supports WebAuthn Platform Authenticator (Android Fingerprint / Biometrics, Windows Hello, TouchID/FaceID)
// with graceful fallback when hardware is unavailable.

export interface BiometricAvailability {
  available: boolean;
  platform: 'webauthn' | 'capacitor' | 'none';
  error?: string;
}

export class BiometricService {
  private static STORAGE_KEY = 'vault_biometric_credential_id';

  /**
   * Check if platform biometrics (fingerprint / face / secure authenticator) are available
   */
  static async isAvailable(): Promise<BiometricAvailability> {
    try {
      if (typeof window === 'undefined') {
        return { available: false, platform: 'none' };
      }

      if (
        window.PublicKeyCredential &&
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
      ) {
        const isSupported = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (isSupported) {
          return { available: true, platform: 'webauthn' };
        }
      }

      return { available: false, platform: 'none', error: 'No biometric hardware detected' };
    } catch (err) {
      return {
        available: false,
        platform: 'none',
        error: err instanceof Error ? err.message : 'Biometric check failed',
      };
    }
  }

  /**
   * Register biometric credential during onboarding / setup
   */
  static async registerBiometric(username: string): Promise<boolean> {
    try {
      const avail = await this.isAvailable();
      if (!avail.available) return false;

      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(username);

      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'Retro Arcade Vault',
            id: window.location.hostname || 'localhost',
          },
          user: {
            id: userId,
            name: username,
            displayName: username,
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' }, // ES256
            { alg: -257, type: 'public-key' }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            requireResidentKey: false,
          },
          timeout: 60000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;

      if (credential) {
        localStorage.setItem(this.STORAGE_KEY, credential.id);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('Biometric registration skipped or failed:', err);
      return false;
    }
  }

  /**
   * Authenticate user with platform biometric sensor
   */
  static async authenticate(): Promise<{ success: boolean; error?: string }> {
    try {
      const avail = await this.isAvailable();
      if (!avail.available) {
        return { success: false, error: 'Biometric authentication not supported on this device' };
      }

      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credId = localStorage.getItem(this.STORAGE_KEY);

      const allowCredentials: PublicKeyCredentialDescriptor[] = credId
        ? [
            {
              id: new TextEncoder().encode(credId),
              type: 'public-key',
              transports: ['internal'],
            },
          ]
        : [];

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
          userVerification: 'required',
          timeout: 60000,
        },
      });

      if (assertion) {
        return { success: true };
      }
      return { success: false, error: 'Authentication could not be verified' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biometric verification failed';
      return { success: false, error: msg };
    }
  }

  /**
   * Remove biometric credential
   */
  static clearCredential(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
