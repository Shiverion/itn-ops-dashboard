import { useState } from 'react';
import { deleteRecord, saveEdit } from '../api';
import { fmtDate } from '../format';
import { evidenceFields, opts } from '../forms';
import { certificateBadge, sortCertificates } from '../summary';
import type { Certificate, Options } from '../types';
import { CertificateFromFile } from './CertificateFromFile';
import { AddButton, RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, PagerControls, Panel, SafeLink, StatusChip, usePager } from './ui';

const PAGE_SIZE = 4;

export function CertificatesPanel({ evidence, options }: { evidence: Certificate[]; options?: Options | null }) {
  const edit = useEdit();
  const [fromFile, setFromFile] = useState(false);
  const o = opts(options);
  const sorted = sortCertificates(evidence);
  const pager = usePager(sorted, PAGE_SIZE);
  return (
    <Panel
      title="Certificates"
      count={evidence.length}
      id="certificates"
      actions={
        <div className="flex items-center gap-3">
          <PagerControls pager={pager} label="certificates" />
          <AddButton onClick={() => setFromFile(true)}>From file</AddButton>
          <AddButton onClick={() => edit.open({ title: 'Add a certificate', fields: evidenceFields(o), submit: (v) => saveEdit('evidence', null, v) })}>Certificate</AddButton>
        </div>
      }
    >
      {!evidence.length ? (
        <EmptyState title="No certificates tracked" hint={<>Add SBU, ISO, SMK3 and similar in the <strong>Evidence</strong> tab.</>} />
      ) : (
        // Fixed height for PAGE_SIZE rows, so the card doesn't grow with the list.
        <ul className="min-h-[19rem] divide-y divide-line">
          {pager.visible.map((c, i) => {
            const badge = certificateBadge(c);
            return (
              <li key={`${c.nameOrNumber}-${pager.from + i}`} className="flex h-[4.75rem] items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm leading-snug font-medium text-ink" title={c.nameOrNumber || c.type}>
                    {c.nameOrNumber || c.type}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">{[c.type, c.issuer].filter(Boolean).join(' · ')}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                    {c.validUntil && <span className="text-ink-2">Valid until {fmtDate(c.validUntil)}</span>}
                    <SafeLink url={c.documentUrl} safe={c.documentUrlSafe}>
                      Document
                    </SafeLink>
                    {c.key && (
                      <RowAction
                        onClick={() =>
                          edit.open({
                            title: `Certificate ${c.nameOrNumber}`,
                            fields: evidenceFields(o),
                            initial: fromRaw(c.raw),
                            submit: (v) => saveEdit('evidence', c.key ?? null, v),
                            remove: { label: `certificate ${c.nameOrNumber}`, run: () => deleteRecord('evidence', c.key ?? '') },
                          })
                        }
                      >
                        Edit
                      </RowAction>
                    )}
                  </div>
                </div>
                <StatusChip tone={badge.tone} label={badge.label} />
              </li>
            );
          })}
        </ul>
      )}
      {fromFile && <CertificateFromFile options={o} onClose={() => setFromFile(false)} />}
    </Panel>
  );
}
