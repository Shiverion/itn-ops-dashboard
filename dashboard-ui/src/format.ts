import type { Cell } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-12" -> "12 Oct 2026"; "2026-10-12 08:30" -> "12 Oct 2026, 08:30". Anything else is shown as-is. */
export function fmtDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(s);
  if (!m) return s;
  const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return m[4] ? `${day}, ${m[4]}:${m[5]}` : day;
}

/** Days relative to today, as words: "today", "in 3 days", "5 days ago". */
export function relDays(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** A cell as a finite number, or null for blanks and text. */
export function num(value: Cell | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** 0–100 progress value, clamped. */
export function clampPct(value: number | null): number {
  if (value === null) return 0;
  return Math.max(0, Math.min(100, value));
}

/** A 0–1 fraction cell as a rounded 0–100 percentage, or null. */
export function fractionToPct(value: Cell | null | undefined): number | null {
  const n = num(value);
  return n === null ? null : Math.round(n * 100);
}

const idrCompact = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const idrFull = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

/** Compact rupiah for tiles and rows: "Rp 12,5 M" (miliar). */
export function fmtIdr(value: number): string {
  return idrCompact.format(value);
}

/** Full rupiah for tooltips: "Rp 12.500.000.000". */
export function fmtIdrFull(value: number): string {
  return idrFull.format(value);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
