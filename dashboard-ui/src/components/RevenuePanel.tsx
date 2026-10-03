import { saveEdit } from '../api';
import { fmtIdr, fmtIdrFull } from '../format';
import { invoiceFields, today } from '../forms';
import type { DashboardData, Revenue } from '../types';
import { AddButton, useEdit } from './edit';
import { EmptyState, Panel, StatTile, StatusChip } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Rounds a chart maximum up to 1, 2 or 5 × 10^n. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const n = value / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function change(now: number, before: number): { tone: 'good' | 'warning' | 'neutral'; label: string } {
  if (!before) return { tone: 'neutral', label: now ? 'No invoices this time last year' : 'No invoices yet this year' };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { tone: 'neutral', label: 'Same as last year to date' };
  return { tone: pct > 0 ? 'good' : 'warning', label: `${pct > 0 ? '+' : ''}${pct}% vs last year to date` };
}

/** Headline money tiles: invoiced, collected, owed, backlog. */
export function RevenueKpis({ revenue }: { revenue: Revenue }) {
  const vs = change(revenue.invoicedYtd, revenue.invoicedLastYearToDate);
  const collectedShare = revenue.invoicedYtd ? Math.round((revenue.collectedThisYear / revenue.invoicedYtd) * 100) : null;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label={`Invoiced in ${revenue.year}`}
        href="#/revenue"
        value={<span title={fmtIdrFull(revenue.invoicedYtd)}>{fmtIdr(revenue.invoicedYtd)}</span>}
        sub={<StatusChip tone={vs.tone} label={vs.label} />}
      />
      <StatTile
        label={`Collected in ${revenue.year}`}
        href="#/revenue"
        value={<span title={fmtIdrFull(revenue.collectedThisYear)}>{fmtIdr(revenue.collectedThisYear)}</span>}
        sub={collectedShare === null ? 'Cash received from clients' : `${collectedShare}% of this year’s invoices`}
      />
      <StatTile
        label="Owed to ITN"
        href="#/revenue"
        value={<span title={fmtIdrFull(revenue.outstandingTotal)}>{fmtIdr(revenue.outstandingTotal)}</span>}
        sub={
          revenue.overdueTotal > 0 ? (
            <StatusChip tone="critical" label={`${fmtIdr(revenue.overdueTotal)} overdue`} />
          ) : (
            <StatusChip tone="good" label={revenue.outstandingTotal ? 'Nothing overdue' : 'All invoices paid'} />
          )
        }
      />
      <StatTile
        label="Contract backlog"
        href="#/revenue"
        value={<span title={fmtIdrFull(revenue.backlog)}>{fmtIdr(revenue.backlog)}</span>}
        sub={revenue.activeContractValue ? `Still to bill on ${fmtIdr(revenue.activeContractValue)} of active contracts` : 'Set contract values on active projects'}
      />
    </div>
  );
}

function MonthlyChart({ revenue }: { revenue: Revenue }) {
  const W = 640;
  const H = 220;
  const left = 56;
  const bottom = 24;
  const top = 8;
  const plotW = W - left - 8;
  const plotH = H - top - bottom;
  const max = niceMax(Math.max(...revenue.invoicedByMonth, ...revenue.invoicedLastYearByMonth));
  const slot = plotW / 12;
  const barW = Math.max(4, Math.min(16, slot / 2 - 3));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Invoiced per month in ${revenue.year} compared with ${revenue.year - 1}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={left - 6} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {t === 0 ? '0' : fmtIdr(t).replace('Rp', '').trim()}
            </text>
          </g>
        ))}
        {MONTHS.map((m, i) => {
          const x = left + i * slot + slot / 2;
          const cur = revenue.invoicedByMonth[i];
          const prev = revenue.invoicedLastYearByMonth[i];
          const future = i + 1 > revenue.month;
          return (
            <g key={m}>
              <rect x={x - barW - 1} y={y(prev)} width={barW} height={Math.max(0, top + plotH - y(prev))} rx={2} className="fill-series-2" fillOpacity={0.45}>
                <title>{`${m} ${revenue.year - 1}: ${fmtIdrFull(prev)}`}</title>
              </rect>
              <rect x={x + 1} y={y(cur)} width={barW} height={Math.max(0, top + plotH - y(cur))} rx={2} className={future ? 'fill-series-1/25' : 'fill-series-1'}>
                <title>{`${m} ${revenue.year}: ${fmtIdrFull(cur)}`}</title>
              </rect>
              <text x={x} y={H - 6} textAnchor="middle" className={`text-[11px] ${i + 1 === revenue.month ? 'fill-ink font-semibold' : 'fill-muted'}`}>
                {m}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-series-1" /> Invoiced {revenue.year}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-series-2/45" /> {revenue.year - 1}
        </span>
      </figcaption>
    </figure>
  );
}

function ContractYears({ revenue }: { revenue: Revenue }) {
  const rows = [...revenue.contractsByYear].reverse();
  const max = Math.max(1, ...rows.map((r) => r.total), revenue.contractsUndated.total);
  const bar = (label: string, total: number, count: number, key: string) => (
    <li key={key} className="grid grid-cols-[3.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-xs">
      <span className="tabular text-ink-2">{label}</span>
      <div className="h-2.5 border-l border-ink/30">
        <div className="h-full rounded-r-[4px] bg-series-1" style={{ width: `${(total / max) * 100}%` }} />
      </div>
      <span className="tabular text-right font-medium text-ink" title={`${fmtIdrFull(total)} · ${count} contract${count === 1 ? '' : 's'}`}>
        {fmtIdr(total)}
      </span>
    </li>
  );
  if (!revenue.contractsCount) return null;
  return (
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Contract value won, by year</h3>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => bar(String(r.year), r.total, r.count, String(r.year)))}
        {revenue.contractsUndated.count > 0 && bar('No date', revenue.contractsUndated.total, revenue.contractsUndated.count, 'undated')}
      </ul>
      <p className="mt-2 text-xs text-muted">
        {revenue.contractsCount} contracts, {fmtIdr(revenue.contractsTotal)} in total.
        {revenue.contractsUndated.count > 0 && ' Add contract dates in the Contracts list to place the rest in a year.'}
      </p>
    </div>
  );
}

export function RevenuePanel({ data }: { data: DashboardData }) {
  const revenue = data.revenue;
  const edit = useEdit();
  const codes = data.projects.map((p) => p.projectCode).filter(Boolean);
  if (!revenue) return null;
  const hasInvoices = revenue.invoicedByMonth.some(Boolean) || revenue.invoicedLastYearByMonth.some(Boolean);
  const recordInvoice = () =>
    edit.open({
      title: 'Record an invoice',
      description: 'Revenue on the dashboard comes from these invoices.',
      fields: invoiceFields(codes, true),
      initial: { InvoiceDate: today() },
      submit: (v) => saveEdit('invoice', null, v),
    });
  return (
    <Panel title="Revenue" actions={<AddButton onClick={recordInvoice}>Record invoice</AddButton>} id="revenue">
      {hasInvoices ? (
        <MonthlyChart revenue={revenue} />
      ) : (
        <EmptyState
          title="No invoices recorded yet"
          hint={edit.enabled ? 'Use “Record invoice” for each invoice you send; the monthly chart builds from them.' : 'Add invoices in the Invoices tab of the Finance sheet.'}
        />
      )}
      <ContractYears revenue={revenue} />
    </Panel>
  );
}
