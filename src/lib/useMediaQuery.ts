import { useEffect, useState } from 'react';

/** Matches Tailwind's `lg` breakpoint, where the messenger switches to the split view. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** Tracks a CSS media query so layout can be chosen in code (one tree mounted, not two hidden by CSS). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
