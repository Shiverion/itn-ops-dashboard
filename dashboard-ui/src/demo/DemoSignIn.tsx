import { useState } from 'react';
import logo from '../assets/itn-logo.jpg';
import { demoLogin } from './session';
import { resetDemoData } from './store';

/** Username/password sign-in for the stakeholder demo (checked by api/login). */
export function DemoSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink/50 focus:outline-none';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await demoLogin(username.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto mt-12 max-w-sm rounded-xl border border-line bg-surface p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-12 place-items-center rounded-md bg-white p-1">
          <img src={logo} alt="ITN" className="h-full w-auto" />
        </span>
        <div>
          <h2 className="font-heading text-lg font-semibold text-ink">ITN Ops – demo</h2>
          <p className="text-xs text-ink-2">A fictional company, for demonstration</p>
        </div>
      </div>
      <label htmlFor="demo-user" className="mt-5 block text-xs font-medium text-ink-2">
        Username
      </label>
      <input id="demo-user" autoComplete="username" className={`${input} mt-1`} value={username} onChange={(e) => setUsername(e.target.value)} required />
      <label htmlFor="demo-pass" className="mt-3 block text-xs font-medium text-ink-2">
        Password
      </label>
      <input id="demo-pass" type="password" autoComplete="current-password" className={`${input} mt-1`} value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="mt-5 w-full rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="mt-4 text-xs text-muted">Ask the presenter for the demo login.</p>
    </form>
  );
}

/** Thin banner on every page of the demo. */
export function DemoBanner({ onReset }: { onReset: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/50 bg-surface px-4 py-2 text-xs text-ink-2">
      <span>
        <strong className="text-ink">Demo</strong> — a fictional company. Your changes stay in this browser only; AI answers come from the demo data.
      </span>
      <button
        type="button"
        onClick={() => {
          if (!window.confirm('Reset the demo data? Your changes in this browser will be undone.')) return;
          resetDemoData();
          onReset();
        }}
        className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
      >
        Reset demo data
      </button>
    </div>
  );
}
