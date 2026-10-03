import { useState } from 'react';
import { deleteRecord, saveEdit } from '../api';
import { fmtDate, fmtIdr, fmtIdrFull } from '../format';
import { invoiceFields, paymentFields, today } from '../forms';
import type { DashboardData, Invoice } from '../types';
import { AddButton, RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, PagerControls, Panel, StatusChip, usePager } from './ui';

const AGING_ORDER = ['Not yet due', '0-30', '31-60', '61-90', '90+', 'Undated'];
const AGING_CLASS: Record<string, string> = {
  'Not yet due': 'bg-series-1',
  '0-30': 'bg-warning',
  '31-60': 'bg-serious',
  '61-90': 'bg-critical',
  '90+': 'bg-critical',
  Undated: 'bg-line',
};

function Aging({ buckets, total }: { buckets: Record<string, number>; total: number }) {
  if (!total) return null;
  const parts = AGING_ORDER.filter((k) => buckets[k] > 0);
  return (
    <div className="pb-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-chip" role="img" aria-label="Money owed by age">
        {parts.map((k) => (
          <div key={k} className={AGING_CLASS[k]} style={{ width: `${(buckets[k] / total) * 100}%` }} title={`${k}${k.includes('-') || k.includes('+') ? ' days overdue' : ''}: ${fmtIdrFull(buckets[k])}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {parts.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2 rounded-[2px] ${AGING_CLASS[k]}`} />
            {k === 'Not yet due' || k === 'Undated' ? k : `${k} days late`} · <span className="tabular font-medium text-ink">{fmtIdr(buckets[k])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function InvoiceRow({ inv, codes }: { inv: Invoice; codes: string[] }) {
  const edit = useEdit();
  const paid = inv.outstanding <= 0;
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">
          {inv.invoiceNo} <span className="font-normal text-muted">· {inv.projectName || inv.projectCode}</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-2">
          {fmtDate(inv.invoiceDate)}
          {inv.dueDate && ` · due ${fmtDate(inv.dueDate)}`}
          {inv.paidDate && ` · paid ${fmtDate(inv.paidDate)}`}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {paid ? (
            <StatusChip tone="good" label="Paid" />
          ) : inv.daysOverdue > 0 ? (
            <StatusChip tone={inv.daysOverdue > 60 ? 'critical' : 'serious'} label={`${inv.daysOverdue} days overdue`} />
          ) : (
            <StatusChip tone="neutral" label={inv.paidAmount ? 'Part paid' : 'Not yet due'} />
          )}
          {!paid && (
            <RowAction
              onClick={() =>
                edit.open({
                  title: `Payment for ${inv.invoiceNo}`,
                  fields: paymentFields(),
                  initial: { PaidDate: today(), PaidAmount: inv.amount },
                  submitLabel: 'Save payment',
                  submit: (v) => saveEdit('invoice', inv.invoiceNo, v),
                })
              }
            >
              Mark paid
            </RowAction>
          )}
          <RowAction
            onClick={() =>
              edit.open({
                title: `Invoice ${inv.invoiceNo}`,
                fields: invoiceFields(codes, false),
                initial: fromRaw(inv.raw),
                submit: (v) => saveEdit('invoice', inv.invoiceNo, v),
                remove: { label: `invoice ${inv.invoiceNo}`, run: () => deleteRecord('invoice', inv.invoiceNo) },
              })
            }
          >
            Edit
          </RowAction>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="tabular text-sm font-semibold text-ink" title={fmtIdrFull(inv.amount)}>
          {fmtIdr(inv.amount)}
        </div>
        {!paid && inv.paidAmount > 0 && <div className="tabular text-xs text-muted">{fmtIdr(inv.outstanding)} left</div>}
      </div>
    </li>
  );
}

const PAGE_SIZE = 5;

export function InvoicesPanel({ data }: { data: DashboardData }) {
  const [view, setView] = useState<'open' | 'all'>('open');
  const edit = useEdit();
  const invoices = data.invoices ?? [];
  const open = invoices.filter((i) => i.outstanding > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
  const list = view === 'open' ? open : invoices;
  const pager = usePager(list, PAGE_SIZE);
  const codes = data.projects.map((p) => p.projectCode).filter(Boolean);
  if (!data.invoices) return null;
  const tab = (key: 'open' | 'all', label: string, n: number) => (
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
      title="Invoices"
      count={invoices.length}
      id="invoices"
      actions={
        <div className="flex items-center gap-3">
          <PagerControls pager={pager} label="invoices" />
          <AddButton
            onClick={() =>
              edit.open({ title: 'Record an invoice', fields: invoiceFields(codes, true), initial: { InvoiceDate: today() }, submit: (v) => saveEdit('invoice', null, v) })
            }
          >
            Invoice
          </AddButton>
        </div>
      }
    >
      {data.revenue && <Aging buckets={data.revenue.agingBuckets} total={data.revenue.outstandingTotal} />}
      <div className="flex gap-1 pb-1" role="group" aria-label="Which invoices">
        {tab('open', 'Owed', open.length)}
        {tab('all', 'All', invoices.length)}
      </div>
      <div className="min-h-[24rem]">
        {list.length ? (
          <ul className="divide-y divide-line">
            {pager.visible.map((inv) => (
              <InvoiceRow key={inv.invoiceNo} inv={inv} codes={codes} />
            ))}
          </ul>
        ) : (
          <EmptyState title={view === 'open' ? 'Nothing owed right now' : 'No invoices recorded yet'} />
        )}
      </div>
    </Panel>
  );
}
