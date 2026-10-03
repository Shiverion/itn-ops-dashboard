import { useEffect, useState, type ReactNode } from 'react';
import type { Tone } from '../summary';

// Status colors never carry meaning alone: every chip has an icon and a
// text label, and the label text stays in ink (never the status color).
const TONE_ICON: Record<Tone, { glyph: string; className: string }> = {
  good: { glyph: '✓', className: 'bg-good text-white' },
  warning: { glyph: '!', className: 'bg-warning text-[#1f1814]' },
  serious: { glyph: '!', className: 'bg-serious text-[#1f1814]' },
  critical: { glyph: '!', className: 'bg-critical text-white' },
  neutral: { glyph: '–', className: 'bg-line text-ink-2' },
};

export function StatusChip({ tone, label }: { tone: Tone; label: string }) {
  const icon = TONE_ICON[tone];
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-chip py-0.5 pr-2.5 pl-1 text-xs font-medium text-ink">
      <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] leading-none font-bold ${icon.className}`}>
        {icon.glyph}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Lifecycle status (Active, Prospect, Preparing…): a plain pill, not a status color. */
export function Pill({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${
        strong ? 'border-ink/25 text-ink' : 'border-line text-ink-2'
      }`}
    >
      {strong && <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />}
      {children}
    </span>
  );
}

/**
 * A link only when the server marked the URL safe (Logic.js isSafeUrl:
 * drive/docs/mail.google.com). Anything else is shown as plain text.
 */
export function SafeLink({ url, safe, children, className = '' }: { url: string; safe: boolean; children: ReactNode; className?: string }) {
  if (!url) return null;
  if (!safe) return <span className={`text-muted ${className}`}>{url}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink ${className}`}
    >
      {children}
      <span aria-hidden="true" className="text-muted">↗</span>
    </a>
  );
}

export function Panel({
  title,
  count,
  actions,
  children,
  id,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(31_24_20/0.04),0_1px_3px_rgb(31_24_20/0.06)]">
      <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-5">
        <h2 className="flex items-baseline gap-2 font-heading text-[15px] font-semibold tracking-wide text-ink uppercase">
          {title}
          {count !== undefined && <span className="tabular text-sm font-medium text-muted normal-case">{count}</span>}
        </h2>
        {actions}
      </div>
      <div className="px-4 py-3 sm:px-5">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** A headline number. With `href` the whole tile links to that page (e.g. "#/taxes"). */
export function StatTile({ label, value, sub, href }: { label: string; value: ReactNode; sub?: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 text-sm text-ink-2">
        {label}
        {href && <span aria-hidden="true" className="text-muted">›</span>}
      </div>
      <div className="mt-1 font-heading text-3xl font-semibold text-ink">{value}</div>
      {sub && <div className="mt-2 min-h-5 text-sm text-muted">{sub}</div>}
    </>
  );
  const box = 'block rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(31_24_20/0.04)]';
  return href ? (
    <a href={href} className={`${box} hover:border-ink/30`}>
      {body}
    </a>
  ) : (
    <div className={box}>{body}</div>
  );
}

/**
 * Pages through a list so a panel keeps a fixed size: "1–4 of 12" with
 * previous/next buttons. Resets to the first page when the list changes length.
 */
export function usePager<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage(0);
  }, [items.length]);
  const current = Math.min(page, pages - 1);
  return {
    visible: items.slice(current * pageSize, current * pageSize + pageSize),
    page: current,
    pages,
    from: items.length ? current * pageSize + 1 : 0,
    to: Math.min(items.length, (current + 1) * pageSize),
    total: items.length,
    prev: () => setPage((p) => Math.max(0, p - 1)),
    next: () => setPage((p) => Math.min(pages - 1, p + 1)),
  };
}

export function PagerControls({ pager, label }: { pager: ReturnType<typeof usePager<unknown>>; label: string }) {
  if (pager.pages <= 1) return null;
  const button = 'grid size-7 place-items-center rounded-md border border-line text-ink-2 hover:bg-chip disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="tabular" aria-live="polite">
        {pager.from}–{pager.to} of {pager.total}
      </span>
      <button type="button" className={button} onClick={pager.prev} disabled={pager.page === 0} aria-label={`Previous ${label}`}>
        ‹
      </button>
      <button type="button" className={button} onClick={pager.next} disabled={pager.page === pager.pages - 1} aria-label={`Next ${label}`}>
        ›
      </button>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-chip ${className}`} />;
}
