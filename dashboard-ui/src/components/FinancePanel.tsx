import { saveEdit } from '../api';
import { fmtDate, fmtIdr, fmtIdrFull } from '../format';
import { contractValueFields } from '../forms';
import { BILLING_GAP_FLAG, financeViews } from '../summary';
import type { FinanceRow, SheetLink } from '../types';
import { AddButton, RowAction, useEdit } from './edit';
import { EmptyState, Panel, SafeLink, StatTile, StatusChip } from './ui';

function Bar({ label, value, colorClass, title }: { label: string; value: number | null; colorClass: string; title: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.75rem] items-center gap-2" title={title}>
      <span className="text-xs text-ink-2">{label}</span>
      {/* Bars grow from a single hairline baseline; 4px rounded data end, square at the baseline. */}
      <div className="h-2.5 border-l border-ink/30">
        <div className={`h-full rounded-r-[4px] ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular text-right text-xs font-semibold text-ink">{value === null ? '—' : `${value}%`}</span>
    </div>
  );
}

export function FinancePanel({ rows, financeSheet, projectCodes = [] }: { rows: FinanceRow[]; financeSheet: SheetLink | null; projectCodes?: string[] }) {
  const edit = useEdit();
  const withoutValue = projectCodes.filter((code) => !rows.some((r) => r.projectCode === code));
  const views = financeViews(rows);
  const withValue = views.filter((v) => v.contract !== null);
  const totalContract = withValue.reduce((s, v) => s + (v.contract ?? 0), 0);
  const billedAmount = withValue.reduce((s, v) => s + (v.contract ?? 0) * ((v.billed ?? 0) / 100), 0);
  const paidAmount = withValue.reduce((s, v) => s + (v.contract ?? 0) * ((v.paid ?? 0) / 100), 0);
  const share = (n: number) => (totalContract ? `${Math.round((n / totalContract) * 100)}% of contract value` : '');

  return (
    <Panel
      title="Billing vs progress"
      count={rows.length}
      id="billing"
      actions={
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>Only visible to people with access to the Finance file</span>
          {withoutValue.length > 0 && (
            <AddButton
              onClick={() =>
                edit.open({ title: 'Set a project contract value', fields: contractValueFields(withoutValue, true), submit: (v) => saveEdit('projectFinance', null, v) })
              }
            >
              Contract value
            </AddButton>
          )}
          {financeSheet && (
            <SafeLink url={financeSheet.url} safe={financeSheet.safe}>
              Finance sheet
            </SafeLink>
          )}
        </div>
      }
    >
      {!rows.length ? (
        <EmptyState title="No finance rows yet" hint={<>Add contract values in <strong>ProjectFinance</strong> and invoices in <strong>Invoices</strong>.</>} />
      ) : (
        <>
          <div className="grid gap-4 py-2 sm:grid-cols-3">
            <StatTile label="Contract value" value={fmtIdr(totalContract)} sub={`${withValue.length} ${withValue.length === 1 ? 'project' : 'projects'}`} />
            <StatTile label="Billed to date" value={fmtIdr(billedAmount)} sub={share(billedAmount)} />
            <StatTile label="Collected to date" value={fmtIdr(paidAmount)} sub={share(paidAmount)} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-2" aria-label="Legend">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-series-1" /> Physical progress
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-series-2" /> Billed (% of contract)
            </span>
            <span className="text-muted">Sorted by how far billing trails progress</span>
          </div>

          <ul className="mt-2 divide-y divide-line">
            {views.map((v) => (
              <li key={v.row.projectCode} className="grid gap-3 py-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <div className="tabular text-xs font-medium text-muted">{v.row.projectCode}</div>
                  <p className="text-sm leading-snug font-medium text-ink">{v.row.projectName || 'Not in the project register'}</p>
                  {v.contract !== null && (
                    <p className="tabular mt-0.5 text-sm text-ink-2" title={fmtIdrFull(v.contract)}>
                      {fmtIdr(v.contract)}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Bar label="Physical" value={v.physical} colorClass="bg-series-1" title={`Physical progress ${v.physical}%`} />
                  <Bar
                    label="Billed"
                    value={v.billed}
                    colorClass="bg-series-2"
                    title={v.billed === null || v.contract === null ? 'Billed' : `Billed ${v.billed}% (${fmtIdrFull((v.contract * v.billed) / 100)})`}
                  />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-ink-2">
                    {v.gap !== null && v.gap >= BILLING_GAP_FLAG && (
                      <StatusChip tone="warning" label={`Billing ${v.gap} pts behind progress`} />
                    )}
                    {v.paid !== null && <span>Collected {v.paid}%</span>}
                    {v.row.lastInvoiceDate && <span>Last invoice {fmtDate(v.row.lastInvoiceDate)}</span>}
                    <RowAction
                      onClick={() =>
                        edit.open({
                          title: `Contract value: ${v.row.projectCode}`,
                          description: v.row.projectName,
                          fields: contractValueFields([v.row.projectCode], false),
                          initial: { ProjectCode: v.row.projectCode, ContractValue: v.contract ?? '' },
                          submit: (vals) => saveEdit('projectFinance', v.row.projectCode, vals),
                        })
                      }
                    >
                      Edit value
                    </RowAction>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
