// Display rules derived from the payload. All date math (days left, days
// since) is already done on the server in Asia/Jakarta; this file only
// decides tones, labels and ordering.
import { num, relDays, fractionToPct } from './format';
import type { Certificate, FinanceRow, Project, Tender } from './types';

export type Tone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export interface Badge {
  tone: Tone;
  label: string;
}

const STATUS_ORDER = ['Active', 'Prospect', 'On Hold', 'Completed', 'Closed'];

export function isActive(p: Project): boolean {
  return p.status === 'Active';
}

export function needsUpdate(p: Project, staleDays: number): boolean {
  return isActive(p) && (p.lastUpdateAgeDays === null || p.lastUpdateAgeDays > staleDays);
}

export function sortProjects(projects: Project[]): Project[] {
  const rank = (s: string) => {
    const i = STATUS_ORDER.indexOf(s);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  return [...projects].sort((a, b) => rank(a.status) - rank(b.status) || a.projectCode.localeCompare(b.projectCode));
}

export function updateBadge(p: Project, staleDays: number): Badge {
  const age = p.lastUpdateAgeDays;
  if (age === null) return isActive(p) ? { tone: 'warning', label: 'No updates yet' } : { tone: 'neutral', label: 'No updates' };
  if (isActive(p) && age > staleDays) return { tone: 'warning', label: `No update for ${age} days` };
  if (age === 0) return { tone: 'good', label: 'Updated today' };
  if (age === 1) return { tone: 'good', label: 'Updated yesterday' };
  return { tone: isActive(p) ? 'good' : 'neutral', label: `Updated ${age} days ago` };
}

export function milestoneBadge(p: Project): Badge | null {
  const d = p.nextMilestoneDaysLeft;
  if (d === null || !p.nextMilestone) return null;
  if (d < 0) return { tone: 'serious', label: `Overdue by ${-d} ${-d === 1 ? 'day' : 'days'}` };
  if (d <= 7) return { tone: 'warning', label: `Due ${relDays(d)}` };
  return null;
}

export function tenderTone(daysLeft: number): Tone {
  if (daysLeft <= 3) return 'critical';
  if (daysLeft <= 7) return 'warning';
  return 'neutral';
}

/** Tenders with an upcoming stage, soonest first; the rest separately. */
export function splitTenders(tenders: Tender[]): { upcoming: Tender[]; other: Tender[] } {
  const upcoming = tenders
    .filter((t) => t.nextStage)
    .sort((a, b) => (a.nextStage?.daysLeft ?? 0) - (b.nextStage?.daysLeft ?? 0));
  const other = tenders.filter((t) => !t.nextStage);
  return { upcoming, other };
}

export function certificateBadge(c: Certificate): Badge {
  switch (c.status) {
    case 'Expired':
      return { tone: 'critical', label: c.daysLeft === null ? 'Expired' : `Expired ${relDays(c.daysLeft)}` };
    case 'Invalid date':
      return { tone: 'critical', label: 'Check expiry date' };
    case 'Expiring':
      return {
        tone: c.daysLeft !== null && c.daysLeft <= 30 ? 'serious' : 'warning',
        label: c.daysLeft === null ? 'Expiring' : `Expires ${relDays(c.daysLeft)}`,
      };
    case 'Valid':
      return { tone: 'good', label: 'Valid' };
    default:
      return { tone: 'neutral', label: 'No expiry' };
  }
}

const CERT_RANK: Record<string, number> = { Expired: 0, 'Invalid date': 1, Expiring: 2, Valid: 3, 'No expiry': 4 };

export function sortCertificates(certs: Certificate[]): Certificate[] {
  return [...certs].sort(
    (a, b) =>
      (CERT_RANK[a.status] ?? 5) - (CERT_RANK[b.status] ?? 5) ||
      (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER),
  );
}

export function needsRenewal(c: Certificate): boolean {
  return c.status === 'Expired' || c.status === 'Expiring' || c.status === 'Invalid date';
}

export interface FinanceView {
  row: FinanceRow;
  contract: number | null;
  physical: number;
  billed: number | null;
  paid: number | null;
  /** physical − billed, in percentage points; positive = billing behind progress. */
  gap: number | null;
}

export function financeViews(rows: FinanceRow[]): FinanceView[] {
  return rows
    .map((row) => {
      const physical = Math.round(row.physicalProgressPct || 0);
      const billed = fractionToPct(row.billedPct);
      return {
        row,
        contract: num(row.contractValue),
        physical,
        billed,
        paid: fractionToPct(row.paidPct),
        gap: billed === null ? null : physical - billed,
      };
    })
    .sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
}

/** Billing this many points behind physical progress gets flagged. */
export const BILLING_GAP_FLAG = 10;
