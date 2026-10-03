import { useState } from 'react';
import { deleteRecord, saveEdit } from '../api';
import { fmtDate, fmtIdr, fmtIdrFull } from '../format';
import { opts, taxFields, taxPaidFields, today } from '../forms';
import type { Tone } from '../summary';
import type { DashboardData, TaxRow } from '../types';
import { AddButton, RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, PagerControls, Panel, StatusChip, usePager } from './ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09" -> "Sep 2026"; "2025" -> "2025". */
export function fmtPeriod(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : period;
}

export function taxTone(t: TaxRow): Tone {
  switch (t.status.state) {
    case 'overdue':
      return 'critical';
    case 'due-soon':
      return (t.status.daysLeft ?? 99) <= 3 ? 'serious' : 'warning';
    case 'undated':
      return 'warning';
    case 'done':
      return 'good';
    default:
      return 'neutral';
  }
}

/** The status label, with the date written out ("Pay by 15 Oct 2026"). */
export function taxLabel(t: TaxRow): string {
  const s = t.status;
  return s.state === 'upcoming' && s.action && s.due ? `${s.action} by ${fmtDate(s.due)}` : s.label;
}

/** Taxes that need attention now: overdue or due within 7 days. */
export function urgentTaxes(taxes: TaxRow[] | null | undefined): TaxRow[] {
  return (taxes ?? []).filter((t) => t.status.state === 'overdue' || t.status.state === 'due-soon');
}

/** Banner at the top of the page when a tax deadline is close or missed. */
export function TaxAlert({ taxes, linkToTaxes = true }: { taxes: TaxRow[] | null | undefined; linkToTaxes?: boolean }) {
  const urgent = urgentTaxes(taxes);
  if (!urgent.length) return null;
  const overdue = urgent.some((t) => t.status.state === 'overdue');
  return (
    <div role="alert" className={`rounded-xl border bg-surface p-4 ${overdue ? 'border-critical/50' : 'border-warning/60'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-ink">
          {overdue ? 'Tax deadline missed' : 'Tax deadlines this week'} · {urgent.length} {urgent.length === 1 ? 'item' : 'items'}
        </p>
        {linkToTaxes && (
          <a href="#/taxes" className="text-sm font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
            Go to taxes
          </a>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-2">
        {urgent.slice(0, 6).map((t) => (
          <li key={t.taxId}>
            <StatusChip tone={taxTone(t)} label={`${t.taxType} ${fmtPeriod(t.period)}: ${taxLabel(t)}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaxLine({ t, data }: { t: TaxRow; data: DashboardData }) {
  const edit = useEdit();
  const o = opts(data.options);
  const done = t.status.state === 'done';
  const needsPay = !t.paidDate && !t.statusOverride;
  const needsReport = !t.reportedDate && t.statusOverride !== 'Withheld by client' && t.statusOverride !== 'Not applicable';
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {t.taxType} <span className="font-normal text-ink-2">· {fmtPeriod(t.period)}</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-2">
          {t.paidDate ? `Paid ${fmtDate(t.paidDate)}` : `Pay by ${fmtDate(t.payDueDate) || '—'}`}
          {' · '}
          {t.reportedDate ? `reported ${fmtDate(t.reportedDate)}` : `report by ${fmtDate(t.reportDueDate) || '—'}`}
          {t.ntpn && ` · NTPN ${t.ntpn}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusChip tone={taxTone(t)} label={taxLabel(t)} />
          {!done && needsPay && (
            <RowAction
              onClick={() =>
                edit.open({
                  title: `Payment: ${t.taxType} ${fmtPeriod(t.period)}`,
                  fields: taxPaidFields(),
                  initial: { ...fromRaw(t.raw), PaidDate: today() },
                  submitLabel: 'Save payment',
                  submit: (v) => saveEdit('tax', t.taxId, v),
                })
              }
            >
              Mark paid
            </RowAction>
          )}
          {!done && needsReport && (
            <RowAction
              onClick={() =>
                edit.open({
                  title: `Report filed: ${t.taxType} ${fmtPeriod(t.period)}`,
                  fields: [{ name: 'ReportedDate', label: 'Reported on', type: 'date', required: true }],
                  initial: { ReportedDate: today() },
                  submitLabel: 'Save',
                  submit: (v) => saveEdit('tax', t.taxId, v),
                })
              }
            >
              Mark reported
            </RowAction>
          )}
          <RowAction
            onClick={() =>
              edit.open({
                title: `${t.taxType} ${fmtPeriod(t.period)}`,
                fields: taxFields(o, false),
                initial: fromRaw(t.raw),
                submit: (v) => saveEdit('tax', t.taxId, v),
                remove: { label: `${t.taxType} ${fmtPeriod(t.period)} (the daily job re-adds it if it is last or this month)`, run: () => deleteRecord('tax', t.taxId) },
              })
            }
          >
            Edit
          </RowAction>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {t.amount !== null && (
          <div className="tabular text-sm font-semibold text-ink" title={fmtIdrFull(t.amount)}>
            {fmtIdr(t.amount)}
          </div>
        )}
      </div>
    </li>
  );
}

const PAGE_SIZE = 6;

export function TaxesPanel({ data }: { data: DashboardData }) {
  const [view, setView] = useState<'todo' | 'done'>('todo');
  const edit = useEdit();
  const taxes = data.taxes;
  const todo = (taxes ?? []).filter((t) => t.status.state !== 'done');
  const done = (taxes ?? []).filter((t) => t.status.state === 'done');
  const list = view === 'todo' ? todo : done;
  const pager = usePager(list, PAGE_SIZE);
  if (data.finance === null) return null;
  const tab = (key: 'todo' | 'done', label: string, n: number) => (
    <button
      type="button"
      onClick={() => setView(key)}
      aria-pressed={view === key}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === key ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-chip'}`}
    >
      {label} <span className="tabular opacity-70">{n}</span>
    </button>
  );
  return (
    <Panel
      title="Taxes"
      count={taxes?.length}
      id="taxes"
      actions={
        <div className="flex items-center gap-3">
          <PagerControls pager={pager} label="tax periods" />
          {taxes && (
            <AddButton
              onClick={() => edit.open({ title: 'Add a tax period', fields: taxFields(opts(data.options), true), submit: (v) => saveEdit('tax', null, v) })}
            >
              Tax period
            </AddButton>
          )}
        </div>
      }
    >
      {!taxes ? (
        <EmptyState title="The Taxes tab isn’t set up yet" hint="The admin runs setupItnOps once in the admin Apps Script project to add it." />
      ) : (
        <>
          <div className="flex gap-1 pb-1" role="group" aria-label="Which taxes">
            {tab('todo', 'To do', todo.length)}
            {tab('done', 'Done', done.length)}
          </div>
          <div className="min-h-[26rem]">
            {list.length ? (
              <ul className="divide-y divide-line">
                {pager.visible.map((t) => (
                  <TaxLine key={t.taxId} t={t} data={data} />
                ))}
              </ul>
            ) : (
              <EmptyState title={view === 'todo' ? 'Nothing to pay or report' : 'Nothing marked done yet'} hint={view === 'todo' ? 'New monthly rows are added automatically each day.' : undefined} />
            )}
          </div>
          <p className="pt-2 text-xs text-muted">
            Default deadlines: PPh 4(2), 21, 23 and 25 paid by the 15th and reported by the 20th of the next month; PPN by the end of the next month; annual SPT by 30 April. Edit a row if your
            deadline differs.
          </p>
        </>
      )}
    </Panel>
  );
}
