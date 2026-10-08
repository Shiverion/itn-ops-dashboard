import { deleteRecord, saveEdit } from '../api';
import { fmtDate } from '../format';
import { opts, tenderFields } from '../forms';
import type { DashboardData } from '../types';
import { ProjectEmails } from './ProjectEmails';
import { RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, Pill, SafeLink } from './ui';

const DATES: [string, string][] = [
  ['RegistrationDeadline', 'Registration'],
  ['AanwijzingDate', 'Aanwijzing'],
  ['QnADeadline', 'Q&A'],
  ['SubmissionDeadline', 'Submission'],
  ['LastAddendumDate', 'Last addendum'],
];

/** One tender: its details from the register and the email threads about it. */
export function TenderPage({ data, id }: { data: DashboardData; id: string }) {
  const edit = useEdit();
  const tender = data.tenders.find((t) => t.tenderId === id);
  if (!tender) {
    return <EmptyState title={`Tender ${id} was not found`} hint={<a href="#/tenders" className="underline">Back to tenders</a>} />;
  }
  const raw = tender.raw ?? {};
  const text = (k: string) => String(raw[k] ?? '').trim();
  const codes = data.projects.map((p) => p.projectCode).filter(Boolean);
  const linked = tender.linkedProjectCode && codes.includes(tender.linkedProjectCode) ? tender.linkedProjectCode : '';
  const dates = DATES.filter(([k]) => text(k));
  const facts: [string, string][] = [
    ['Reference', text('ReferenceNo')],
    ['Source', text('PortalOrSource')],
    ['Owner', tender.ownerEmail],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <>
      <a href="#/tenders" className="text-sm text-ink-2 hover:text-ink">
        ← All tenders
      </a>
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="tabular text-xs font-medium text-muted">{tender.tenderId}</div>
            <h2 className="font-heading text-2xl font-semibold break-words text-ink">{tender.title || tender.tenderId}</h2>
            {tender.buyer && <p className="mt-0.5 text-sm text-ink-2">{tender.buyer}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Pill strong>{tender.status || 'No status'}</Pill>
            <RowAction
              onClick={() =>
                edit.open({
                  title: `Tender ${tender.tenderId}`,
                  fields: tenderFields(opts(data.options), codes),
                  initial: fromRaw(tender.raw),
                  submit: (v) => saveEdit('tender', tender.tenderId, v),
                  remove: {
                    label: `tender ${tender.tenderId}`,
                    run: async () => {
                      const reply = await deleteRecord('tender', tender.tenderId);
                      window.location.hash = '#/tenders';
                      return reply;
                    },
                  },
                })
              }
            >
              Edit details
            </RowAction>
          </div>
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-0.5 break-words text-ink">{value}</dd>
            </div>
          ))}
          {dates.map(([k, label]) => (
            <div key={k}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="tabular mt-0.5 text-ink">{fmtDate(text(k))}</dd>
            </div>
          ))}
          {linked && (
            <div>
              <dt className="text-xs text-muted">Became project</dt>
              <dd className="mt-0.5">
                <a href={`#/projects/${encodeURIComponent(linked)}`} className="font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                  {linked}
                </a>
              </dd>
            </div>
          )}
        </dl>
        {(text('ScreeningSummary') || text('AddendumNotes')) && (
          <div className="mt-4 space-y-2 text-sm">
            {text('ScreeningSummary') && (
              <p className="text-ink-2">
                <span className="font-medium text-ink">Screening:</span> {text('ScreeningSummary')}
              </p>
            )}
            {text('AddendumNotes') && (
              <p className="text-ink-2">
                <span className="font-medium text-ink">Addenda:</span> {text('AddendumNotes')}
              </p>
            )}
          </div>
        )}
        {tender.documentsUrl && (
          <div className="mt-3 text-sm">
            <SafeLink url={tender.documentsUrl} safe={tender.documentsUrlSafe}>
              Tender documents
            </SafeLink>
          </div>
        )}
      </section>
      {data.tenderEmails && <ProjectEmails emails={data.tenderEmails[tender.tenderId] ?? []} kind="tenders" />}
    </>
  );
}
