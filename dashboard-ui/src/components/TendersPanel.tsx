import { useState } from 'react';
import { deleteRecord, saveEdit } from '../api';
import { fmtDate, plural, relDays } from '../format';
import { opts, tenderFields } from '../forms';
import { splitTenders, tenderTone } from '../summary';
import type { Options, ProjectEmail, Tender } from '../types';
import { AddButton, RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, PagerControls, Panel, Pill, SafeLink, StatusChip, usePager } from './ui';

const STRIPE: Record<string, string> = {
  critical: 'border-critical',
  warning: 'border-warning',
  neutral: 'border-line',
};

function TenderRow({ tender, options, codes, emailCount }: { tender: Tender; options: Options; codes: string[]; emailCount: number }) {
  const edit = useEdit();
  const stage = tender.nextStage;
  const tone = stage ? tenderTone(stage.daysLeft) : 'neutral';
  return (
    <li className="flex h-[6.5rem] gap-3 overflow-hidden py-3">
      <div className={`w-14 shrink-0 border-l-[3px] pl-2.5 ${STRIPE[tone] ?? 'border-line'}`}>
        {stage ? (
          <>
            <div className="tabular font-heading text-2xl leading-none font-semibold text-ink">{stage.daysLeft}</div>
            <div className="mt-1 text-[11px] text-muted">{stage.daysLeft === 1 ? 'day' : 'days'}</div>
          </>
        ) : (
          <div className="font-heading text-2xl leading-none text-muted">—</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <a
            href={`#/tenders/${encodeURIComponent(tender.tenderId)}`}
            className="line-clamp-2 text-sm leading-snug font-medium text-ink hover:underline hover:decoration-line hover:underline-offset-4"
            title={tender.title}
          >
            {tender.title || tender.tenderId}
          </a>
          <Pill>{tender.status || 'No status'}</Pill>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{[tender.tenderId, tender.buyer].filter(Boolean).join(' · ')}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {stage ? (
            tone === 'neutral' ? (
              <span className="text-ink-2">
                {stage.label} · {fmtDate(stage.date)}
              </span>
            ) : (
              <>
                <StatusChip tone={tone} label={`${stage.label} ${relDays(stage.daysLeft)}`} />
                <span className="text-ink-2">{fmtDate(stage.date)}</span>
              </>
            )
          ) : (
            <span className="text-muted">No upcoming date</span>
          )}
          <SafeLink url={tender.documentsUrl} safe={tender.documentsUrlSafe}>
            Documents
          </SafeLink>
          {emailCount > 0 && (
            <a href={`#/tenders/${encodeURIComponent(tender.tenderId)}`} className="text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
              {plural(emailCount, 'email', 'emails')}
            </a>
          )}
          <RowAction
            onClick={() =>
              edit.open({
                title: `Tender ${tender.tenderId}`,
                fields: tenderFields(options, codes),
                initial: fromRaw(tender.raw),
                submit: (v) => saveEdit('tender', tender.tenderId, v),
                remove: { label: `tender ${tender.tenderId}`, run: () => deleteRecord('tender', tender.tenderId) },
              })
            }
          >
            Edit
          </RowAction>
        </div>
      </div>
    </li>
  );
}

const PAGE_SIZE = 4;

export function TendersPanel({
  tenders,
  options,
  projectCodes = [],
  emails,
}: {
  tenders: Tender[];
  options?: Options | null;
  projectCodes?: string[];
  emails?: Record<string, ProjectEmail[]> | null;
}) {
  const edit = useEdit();
  const o = opts(options);
  const { upcoming, other } = splitTenders(tenders);
  const [view, setView] = useState<'upcoming' | 'other'>('upcoming');
  const list = view === 'upcoming' ? upcoming : other;
  const pager = usePager(list, PAGE_SIZE);
  const tab = (key: 'upcoming' | 'other', label: string, n: number) => (
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
      title="Tenders"
      count={tenders.length}
      id="tenders"
      actions={
        <div className="flex items-center gap-3">
          <PagerControls pager={pager} label="tenders" />
          <AddButton onClick={() => edit.open({ title: 'New tender', fields: tenderFields(o, projectCodes), initial: { Status: 'New' }, submit: (v) => saveEdit('tender', null, v) })}>
            Tender
          </AddButton>
        </div>
      }
    >
      {!tenders.length ? (
        <EmptyState title="No tenders tracked" hint={<>Add tenders in the <strong>Tenders</strong> tab of the Operations sheet.</>} />
      ) : (
        <>
          <div className="flex gap-1 pb-1" role="group" aria-label="Which tenders">
            {tab('upcoming', 'Upcoming deadlines', upcoming.length)}
            {tab('other', 'Past & no date', other.length)}
          </div>
          {/* Fixed height for PAGE_SIZE rows, so the card doesn't grow with the list. */}
          <div className="h-[26rem]">
            {list.length ? (
              <ul className="divide-y divide-line">
                {pager.visible.map((t) => (
                  <TenderRow key={t.tenderId || t.title} tender={t} options={o} codes={projectCodes} emailCount={emails?.[t.tenderId]?.length ?? 0} />
                ))}
              </ul>
            ) : (
              <EmptyState title={view === 'upcoming' ? 'No upcoming tender dates' : 'Nothing here'} />
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
