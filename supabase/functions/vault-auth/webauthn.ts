// Server-side WebAuthn verification (no third-party dependencies; WebCrypto only).
// Supports ES256 (-7, ECDSA P-256) and RS256 (-257, RSASSA-PKCS1-v1_5 SHA-256).

export class WebAuthnError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'WebAuthnError';
    this.code = code;
  }
}

export const COSE_ES256 = -7;
export const COSE_RS256 = -257;

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_ATTESTED_CREDENTIAL = 0x40;

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(value: string): Uint8Array {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new WebAuthnError('bad_encoding', 'Expected base64url');
  }
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
}

export interface ClientData {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

export function parseClientData(clientDataJSON: string): ClientData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(clientDataJSON)));
  } catch {
    throw new WebAuthnError('bad_client_data');
  }
  const cd = parsed as ClientData;
  if (!cd || typeof cd.type !== 'string' || typeof cd.challenge !== 'string' || typeof cd.origin !== 'string') {
    throw new WebAuthnError('bad_client_data');
  }
  return cd;
}

export interface AuthenticatorData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  credentialId?: Uint8Array;
}

export function parseAuthenticatorData(bytes: Uint8Array): AuthenticatorData {
  if (bytes.length < 37) throw new WebAuthnError('bad_authenticator_data');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[32];
  const result: AuthenticatorData = {
    rpIdHash: bytes.slice(0, 32),
    flags,
    signCount: view.getUint32(33, false),
  };
  if (flags & FLAG_ATTESTED_CREDENTIAL) {
    // aaguid (16) | credentialIdLength (2) | credentialId | credentialPublicKey (COSE)
    if (bytes.length < 55) throw new WebAuthnError('bad_authenticator_data');
    const idLen = view.getUint16(53, false);
    if (bytes.length < 55 + idLen) throw new WebAuthnError('bad_authenticator_data');
    result.credentialId = bytes.slice(55, 55 + idLen);
  }
  return result;
}

function algorithmParams(alg: number): { importAlg: EcKeyImportParams | RsaHashedImportParams; verifyAlg: EcdsaParams | AlgorithmIdentifier } {
  if (alg === COSE_ES256) {
    return { importAlg: { name: 'ECDSA', namedCurve: 'P-256' }, verifyAlg: { name: 'ECDSA', hash: 'SHA-256' } };
  }
  if (alg === COSE_RS256) {
    return { importAlg: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verifyAlg: { name: 'RSASSA-PKCS1-v1_5' } };
  }
  throw new WebAuthnError('unsupported_algorithm');
}

export async function importPublicKey(spki: Uint8Array, alg: number): Promise<CryptoKey> {
  const { importAlg } = algorithmParams(alg);
  try {
    return await crypto.subtle.importKey('spki', spki as BufferSource, importAlg, false, ['verify']);
  } catch {
    throw new WebAuthnError('bad_public_key');
  }
}

// WebAuthn ES256 signatures are ASN.1 DER; WebCrypto wants r||s (32 bytes each).
export function derToRawEcdsa(der: Uint8Array, size = 32): Uint8Array {
  let i = 0;
  const fail = () => {
    throw new WebAuthnError('bad_signature');
  };
  if (der[i++] !== 0x30) fail();
  let seqLen = der[i++];
  if (seqLen & 0x80) {
    const n = seqLen & 0x7f;
    seqLen = 0;
    for (let k = 0; k < n; k++) seqLen = (seqLen << 8) | der[i++];
  }
  if (i + seqLen !== der.length) fail();
  const readInt = (): Uint8Array => {
    if (der[i++] !== 0x02) fail();
    const len = der[i++];
    if (len === 0 || i + len > der.length) fail();
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    if (v.length > size) fail();
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  if (i !== der.length) fail();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

export interface Expected {
  challenge: string;
  origin: string;
  rpId: string;
}

async function checkCommon(
  clientData: ClientData,
  authData: AuthenticatorData,
  type: 'webauthn.create' | 'webauthn.get',
  expected: Expected,
): Promise<void> {
  if (clientData.type !== type) throw new WebAuthnError('wrong_type');
  if (clientData.challenge !== expected.challenge) throw new WebAuthnError('challenge_mismatch');
  if (clientData.origin !== expected.origin) throw new WebAuthnError('origin_mismatch');
  if (clientData.crossOrigin === true) throw new WebAuthnError('cross_origin');
  const rpIdHash = await sha256(new TextEncoder().encode(expected.rpId));
  if (!equalBytes(authData.rpIdHash, rpIdHash)) throw new WebAuthnError('rp_id_mismatch');
  if (!(authData.flags & FLAG_USER_PRESENT)) throw new WebAuthnError('user_not_present');
  if (!(authData.flags & FLAG_USER_VERIFIED)) throw new WebAuthnError('user_not_verified');
}

export interface RegistrationInput {
  credentialId: string; // base64url rawId
  clientDataJSON: string; // base64url
  authenticatorData: string; // base64url, from AuthenticatorAttestationResponse.getAuthenticatorData()
  publicKey: string; // base64url SPKI, from getPublicKey()
  publicKeyAlgorithm: number; // from getPublicKeyAlgorithm()
}

export interface VerifiedCredential {
  credentialId: string;
  publicKey: string;
  algorithm: number;
  signCount: number;
}

// Attestation is 'none', so the public key is taken from the enrolling browser. That is acceptable
// because enrollment requires an already signed-in session: a user can only add keys to their own
// account. What this check guarantees is that the ceremony used this server's fresh challenge, ran
// on an allowed origin for this RP ID, verified the user (fingerprint/face/PIN on the device) and
// produced the credential id being stored.
export async function verifyRegistration(input: RegistrationInput, expected: Expected): Promise<VerifiedCredential> {
  const clientData = parseClientData(input.clientDataJSON);
  const authData = parseAuthenticatorData(b64urlDecode(input.authenticatorData));
  await checkCommon(clientData, authData, 'webauthn.create', expected);
  if (!authData.credentialId) throw new WebAuthnError('missing_credential');
  const claimedId = b64urlDecode(input.credentialId);
  if (!equalBytes(authData.credentialId, claimedId)) throw new WebAuthnError('credential_id_mismatch');
  await importPublicKey(b64urlDecode(input.publicKey), input.publicKeyAlgorithm);
  return {
    credentialId: b64urlEncode(claimedId),
    publicKey: input.publicKey,
    algorithm: input.publicKeyAlgorithm,
    signCount: authData.signCount,
  };
}

export interface AssertionInput {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
}

export interface StoredCredential {
  publicKey: string;
  algorithm: number;
  signCount: number;
}

export async function verifyAuthentication(
  input: AssertionInput,
  credential: StoredCredential,
  expected: Expected,
): Promise<{ signCount: number }> {
  const clientData = parseClientData(input.clientDataJSON);
  const authDataBytes = b64urlDecode(input.authenticatorData);
  const authData = parseAuthenticatorData(authDataBytes);
  await checkCommon(clientData, authData, 'webauthn.get', expected);

  const key = await importPublicKey(b64urlDecode(credential.publicKey), credential.algorithm);
  const clientDataHash = await sha256(b64urlDecode(input.clientDataJSON));
  const signed = new Uint8Array(authDataBytes.length + clientDataHash.length);
  signed.set(authDataBytes, 0);
  signed.set(clientDataHash, authDataBytes.length);

  let signature = b64urlDecode(input.signature);
  if (credential.algorithm === COSE_ES256) signature = derToRawEcdsa(signature);
  const { verifyAlg } = algorithmParams(credential.algorithm);
  const ok = await crypto.subtle.verify(verifyAlg, key, signature as BufferSource, signed as BufferSource);
  if (!ok) throw new WebAuthnError('bad_signature');

  // Counter must increase when the authenticator implements one (0 = no counter, e.g. passkeys).
  if ((authData.signCount !== 0 || credential.signCount !== 0) && authData.signCount <= credential.signCount) {
    throw new WebAuthnError('counter_regression', 'Possible cloned authenticator');
  }
  return { signCount: authData.signCount };
}
