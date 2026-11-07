import { useSyncExternalStore } from 'react';

/**
 * Light ("paper"), dark ("vault") or follow the OS. The choice is a per-viewer convenience only, so every storage access
 * is guarded: a blocked localStorage just means the page follows the OS.
 */
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'aegispay-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let pref: ThemePref = read();

/** The theme that is actually showing right now. */
export const resolvedTheme = (): 'light' | 'dark' => (pref === 'system' ? (media.matches ? 'dark' : 'light') : pref);

function apply(): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = pref;
  // AG Grid follows the same switch, not just the OS.
  document.body.dataset.agThemeMode = resolvedTheme();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolvedTheme() === 'dark' ? '#0a0f0d' : '#eee9de');
  listeners.forEach((l) => l());
}

export function setThemePref(next: ThemePref): void {
  pref = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* private window or blocked storage: the choice just does not persist */
  }
  apply();
}

/** Call once before first paint. */
export function initTheme(): void {
  apply();
  media.addEventListener('change', apply);
}

export function onThemeChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme(): { pref: ThemePref; resolved: 'light' | 'dark' } {
  const key = useSyncExternalStore(
    (cb) => onThemeChange(cb),
    () => `${pref}:${resolvedTheme()}`,
  );
  const [p, r] = key.split(':') as [ThemePref, 'light' | 'dark'];
  return { pref: p, resolved: r };
}
