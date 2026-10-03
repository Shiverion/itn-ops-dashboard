import { useEffect, useRef, useState } from 'react';
import { startSignIn } from '../auth';

/** Shown on ops.itnconstruction.com until the viewer signs in with their ITN Google account. */
export function SignIn({ onSignedIn, reason }: { onSignedIn: () => void; reason?: string }) {
  const button = useRef<HTMLDivElement>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!button.current) return;
    startSignIn(button.current, onSignedIn).catch((error: Error) => setProblem(error.message));
  }, [onSignedIn]);

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-line bg-surface p-6 text-center">
      <h2 className="font-heading text-lg font-semibold text-ink">Sign in to the ITN Ops dashboard</h2>
      <p className="mt-2 text-sm text-ink-2">Use your @itnconstruction.com Google account.</p>
      {reason && reason !== 'Please sign in.' && <p className="mt-2 text-sm text-muted">{reason}</p>}
      <div ref={button} className="mt-5 flex min-h-11 justify-center" />
      {problem && (
        <p role="alert" className="mt-4 text-sm text-critical">
          {problem}
        </p>
      )}
    </div>
  );
}
