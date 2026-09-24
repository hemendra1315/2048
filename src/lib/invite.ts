const INVITE_PARAM = 'invite';

export function getInviteUidFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const uid = params.get(INVITE_PARAM);
  return uid ? uid.trim().toUpperCase() : null;
}

export function buildInviteLink(uid: string): string {
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.set(INVITE_PARAM, uid);
  return url.toString();
}

export function clearInviteFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete(INVITE_PARAM);
  window.history.replaceState({}, '', url.toString());
}

/** Accepts either a raw UID or a pasted invite link and returns the UID. */
export function extractUidFromInput(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const fromLink = url.searchParams.get(INVITE_PARAM);
    if (fromLink) return fromLink.trim().toUpperCase();
  } catch {
    // Not a URL, fall through and treat as a raw UID.
  }
  return trimmed.toUpperCase();
}
