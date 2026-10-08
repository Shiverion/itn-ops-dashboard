import { useState } from 'react';
import { fmtDate, plural } from '../format';
import type { ProjectEmail } from '../types';
import { EmptyState, Panel, Pill, SafeLink } from './ui';

const SHOWN = 5;

/** The email threads about one project or tender, matched and summarised by the daily knowledge update. */
export function ProjectEmails({ emails, kind = 'projects' }: { emails: ProjectEmail[]; kind?: 'projects' | 'tenders' }) {
  const [all, setAll] = useState(false);
  const list = all ? emails : emails.slice(0, SHOWN);
  return (
    <Panel title="Email" count={emails.length}>
      {!emails.length ? (
        <EmptyState title="No emails matched yet" hint={kind === 'tenders' ? 'Each morning’s update matches info@ mail to tenders by reference, RFQ number, items and buyer.' : 'Each morning’s update matches info@ mail to projects by name, client and aliases.'} />
      ) : (
        <div className="py-1">
          <ul className="divide-y divide-line">
            {list.map((e) => (
              <li key={e.id} className="py-3 first:pt-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Pill>{e.kind}</Pill>
                  <span className="tabular">{fmtDate(e.last.slice(0, 10))}</span>
                  {e.messages > 1 && <span>· {plural(e.messages, 'message', 'messages')}</span>}
                </div>
                <p className="mt-1 text-sm font-medium break-words text-ink">{e.subject || '(no subject)'}</p>
                {e.counterparty && <p className="text-xs text-muted">With {e.counterparty}</p>}
                {e.summary && <p className="mt-1 text-sm text-ink-2">{e.summary}</p>}
                {e.documents.length > 0 && (
                  <p className="mt-1 text-xs break-words text-muted">📎 {e.documents.join(' · ')}</p>
                )}
                {e.link && (
                  <div className="mt-1.5 text-sm">
                    <SafeLink url={e.link} safe>
                      Open in Gmail
                    </SafeLink>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {emails.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 text-sm text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
              {all ? 'Show fewer' : `Show all ${emails.length}`}
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
