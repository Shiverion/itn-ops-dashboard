// Google sign-in for the dashboard on ITN's own domain (web/server.mjs).
// Not used inside Apps Script, where Google signs the viewer in itself.
//
// The Google ID token is kept in memory and in sessionStorage (this tab only,
// gone when the tab closes) until it expires (1 hour); the server checks it on
// every call. Signing in again is usually one tap: Google remembers the account.

interface GsiCredential {
  credential: string;
}

export interface Gsi {
  initialize(config: Record<string, unknown>): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void;
  disableAutoSelect(): void;
}

const STORAGE_KEY = 'itn-ops-id-token';
let token: string | null = null;

function expiresAt(jwt: string): number {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

/** The current ID token, or null if there is none or it expires within a minute. */
export function idToken(): string | null {
  if (!token) {
    try {
      token = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      token = null;
    }
  }
  if (token && expiresAt(token) < Date.now() + 60_000) clearToken();
  return token;
}

export function clearToken(): void {
  token = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: memory only */
  }
}

function saveToken(jwt: string): void {
  token = jwt;
  try {
    sessionStorage.setItem(STORAGE_KEY, jwt);
  } catch {
    /* storage unavailable: memory only */
  }
}

let gsiLoading: Promise<Gsi> | null = null;

function loadGsi(): Promise<Gsi> {
  gsiLoading ??= new Promise<Gsi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load.')));
    script.onerror = () => reject(new Error('Google sign-in could not be loaded. Check the connection and reload.'));
    document.head.appendChild(script);
  });
  return gsiLoading;
}

/**
 * Shows Google's "Sign in with Google" button in `container` (and the one-tap
 * prompt), and calls `onSignedIn` once the viewer has signed in.
 */
export async function startSignIn(container: HTMLElement, onSignedIn: () => void): Promise<void> {
  const config = (await fetch('/api/config').then((r) => r.json())) as { clientId: string; domain: string };
  const gsi = await loadGsi();
  gsi.initialize({
    client_id: config.clientId,
    hd: config.domain,
    auto_select: true,
    use_fedcm_for_prompt: true,
    itp_support: true,
    context: 'signin',
    callback: (response: GsiCredential) => {
      saveToken(response.credential);
      onSignedIn();
    },
  });
  gsi.renderButton(container, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', logo_alignment: 'left' });
  gsi.prompt();
}

export function signOut(): void {
  clearToken();
  window.google?.accounts?.id?.disableAutoSelect();
}
