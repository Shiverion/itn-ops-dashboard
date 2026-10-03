import { deleteRecord, saveEdit } from '../api';
import { fmtDate, fmtIdr, fmtIdrFull } from '../format';
import { contractFields } from '../forms';
import type { DashboardData } from '../types';
import { AddButton, RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, PagerControls, Panel, SafeLink, usePager } from './ui';

const PAGE_SIZE = 5;

/** Signed contracts and POs: the work-experience list (and NPt) and the revenue history by year. */
export function ContractsPanel({ data }: { data: DashboardData }) {
  const edit = useEdit();
  const contracts = data.contracts ?? [];
  const pager = usePager(contracts, PAGE_SIZE);
  const codes = data.projects.map((p) => p.projectCode).filter(Boolean);
  if (data.finance === null) return null;
  const highest = contracts[0];
  return (
    <Panel
      title="Contracts"
      count={data.contracts ? contracts.length : undefined}
      id="contracts"
      actions={
        <div className="flex items-center gap-3">
          <PagerControls pager={pager} label="contracts" />
          {data.contracts && (
            <AddButton onClick={() => edit.open({ title: 'Add a contract or PO', fields: contractFields(codes, true), submit: (v) => saveEdit('contract', null, v) })}>
              Contract
            </AddButton>
          )}
        </div>
      }
    >
      {!data.contracts ? (
        <EmptyState title="The Contracts tab isn’t set up yet" hint="The admin runs setupItnOps once in the admin Apps Script project to add it." />
      ) : !contracts.length ? (
        <EmptyState title="No contracts yet" hint="Add signed contracts and POs; they make up the work-experience list for tenders." />
      ) : (
        <>
          {highest && (
            <p className="pb-2 text-xs text-ink-2">
              Highest single contract (NPt): <span className="tabular font-semibold text-ink">{fmtIdrFull(highest.value)}</span> · {highest.title}
            </p>
          )}
          <ul className="min-h-[22rem] divide-y divide-line">
            {pager.visible.map((c) => (
              <li key={c.contractNo} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm leading-snug font-medium text-ink" title={c.title}>
                    {c.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">{[c.contractNo, c.client].filter(Boolean).join(' · ')}</p>
                  {c.raw.Notes && (
                    <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-ink-2" title={String(c.raw.Notes)}>
                      {String(c.raw.Notes)}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
                    <span>{c.contractDate ? fmtDate(c.contractDate) : <span className="text-muted">No date</span>}</span>
                    {c.documentType && <span>{c.documentType}</span>}
                    <SafeLink url={c.documentUrl} safe={c.documentUrlSafe}>
                      Document
                    </SafeLink>
                    <RowAction
                      onClick={() =>
                        edit.open({
                          title: `Contract ${c.contractNo}`,
                          fields: contractFields(codes, false),
                          initial: fromRaw(c.raw),
                          submit: (v) => saveEdit('contract', c.contractNo, v),
                          remove: { label: `contract ${c.contractNo}`, run: () => deleteRecord('contract', c.contractNo) },
                        })
                      }
                    >
                      Edit
                    </RowAction>
                  </div>
                </div>
                <div className="tabular shrink-0 text-sm font-semibold text-ink" title={fmtIdrFull(c.value)}>
                  {fmtIdr(c.value)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
