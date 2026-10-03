import { useEffect, useState } from 'react';
import { callRefresh, runtime, type RefreshReply } from '../api';
import logo from '../assets/itn-logo.jpg';
import { signOut } from '../auth';
import type { DashboardData, SheetLink } from '../types';

function SheetButton({ link, label }: { link: SheetLink | null; label: string }) {
  if (!link || !link.safe) return null;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border border-white/20 px-2.5 py-1 text-xs font-medium text-header-ink hover:bg-white/10"
    >
      {label}
      <span aria-hidden="true" className="text-header-muted">↗</span>
    </a>
  );
}

function since(iso?: string): string {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

/**
 * Starts the cloud knowledge update (Cloud Run job) for signed-in ITN users.
 * The server checks the viewer's Google identity and applies a cooldown.
 */
function RefreshButton() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>('');
  const [status, setStatus] = useState<RefreshReply | null>(null);

  useEffect(() => {
    callRefresh('getRefreshStatus').then(setStatus);
  }, []);

  const onClick = async () => {
    setBusy(true);
    setNote('Starting…');
    const reply = await callRefresh('requestRefresh');
    setNote(reply.message ?? (reply.ok ? 'Update started.' : 'Could not start the update.'));
    setBusy(false);
  };

  const last = status?.last;
  const lastText = status?.running
    ? 'Knowledge update running…'
    : last?.finished
      ? `Knowledge updated ${since(last.finished)}${last.result === 'FAILED' ? ' (last run failed)' : ''}`
      : '';

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title="Fetch new emails and files into Ask ITN and the dashboard now. It also runs automatically every day at 07:00."
        className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        <span aria-hidden="true" className={busy ? 'inline-block animate-spin' : ''}>↻</span> Refresh knowledge
      </button>
      {(note || lastText) && (
        <span className="max-w-[18rem] text-right text-[11px] text-header-muted" aria-live="polite">
          {note || lastText}
        </span>
      )}
    </div>
  );
}

export function Header({ data, onSignedOut }: { data: DashboardData | null; onSignedOut: () => void }) {
  return (
    <header className="border-b border-white/10 bg-header text-header-ink">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          {/* The official mark (same file as itnconstruction.com), on white like the website. */}
          <a href="#/overview" className="grid h-10 w-12 shrink-0 place-items-center rounded-md bg-white p-1">
            <img src={logo} alt="ITN" className="h-full w-auto object-contain" />
          </a>
          <div>
            <h1 className="font-heading text-lg leading-tight font-semibold">Operations dashboard</h1>
            <p className="text-xs text-header-muted">PT Internasional Teknik Nusantara</p>
          </div>
        </div>
        {data && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-header-muted">
            <span>Updated {data.generatedAt} WIB</span>
            {data.viewerEmail && <span className="hidden sm:inline">{data.viewerEmail}</span>}
            {runtime() === 'web' && (
              <button
                type="button"
                onClick={() => {
                  signOut();
                  onSignedOut();
                }}
                className="text-header-muted underline-offset-2 hover:text-header-ink hover:underline"
              >
                Sign out
              </button>
            )}
            <div className="flex items-start gap-2">
              <SheetButton link={data.opsSheet} label="Operations sheet" />
              <SheetButton link={data.financeSheet} label="Finance sheet" />
              <RefreshButton />
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
