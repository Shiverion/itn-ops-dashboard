import { useRef, useState } from 'react';
import { ACCEPT_FILES, deleteLogEntry, deleteRecord, draftFromFiles, saveEdit, saveLogEntry, uploadFile, type UploadedFile } from '../api';
import { clampPct, fmtDate, num, relDays } from '../format';
import { opts, projectFields, today } from '../forms';
import { milestoneBadge, updateBadge } from '../summary';
import type { DashboardData, LogEntry, Options, Project } from '../types';
import { Advisor } from './Advisor';
import { RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, Panel, Pill, SafeLink, StatusChip } from './ui';

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-ink/50 focus:outline-none disabled:opacity-60';

/** How many entries of each kind came before, so a new one can be titled "3rd meeting". */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function suggestTitle(log: LogEntry[], kind: string): string {
  if (!['Meeting', 'Site visit', 'Negotiation', 'Quotation'].includes(kind)) return '';
  const count = log.filter((e) => e.type === kind).length + 1;
  return `${ordinal(count)} ${kind.toLowerCase()}`;
}

type PendingFile = { key: string; name: string; state: 'uploading' | 'done' | 'error'; file?: UploadedFile; error?: string };

function EntryComposer({ project, options, onSaved }: { project: Project; options: Options; onSaved: (message: string) => void }) {
  const blank = { Type: 'Meeting', Title: suggestTitle(project.log, 'Meeting'), Date: today(), Summary: '', Issues: '', Status: '', PhysicalProgressPct: '', NextMilestone: '', NextMilestoneDate: '' };
  const [v, setV] = useState<Record<string, string>>(blank);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState<'' | 'draft' | 'save'>('');
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const set = (k: string, value: string) => setV((cur) => ({ ...cur, [k]: value }));

  const addFiles = (list: FileList | null) => {
    for (const f of Array.from(list ?? [])) {
      const key = `${f.name}-${f.size}-${Math.random()}`;
      setFiles((cur) => [...cur, { key, name: f.name, state: 'uploading' }]);
      uploadFile(f, { project: project.projectCode }).then(
        (file) => setFiles((cur) => cur.map((p) => (p.key === key ? { ...p, state: 'done', file } : p))),
        (e: Error) => setFiles((cur) => cur.map((p) => (p.key === key ? { ...p, state: 'error', error: e.message } : p))),
      );
    }
  };
  const uploaded = files.filter((f) => f.state === 'done' && f.file).map((f) => f.file!);
  const uploading = files.some((f) => f.state === 'uploading');

  const draft = async () => {
    setBusy('draft');
    setError('');
    try {
      const { draft: d } = await draftFromFiles('log', uploaded.map((f) => f.id), project.projectCode);
      setV((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(d).filter(([, val]) => val !== '')) }));
      if (d.NextMilestone || d.NextMilestoneDate) setMore(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!v.Title.trim() && !v.Summary.trim()) {
      setError('Give the entry a title or a description.');
      return;
    }
    setBusy('save');
    setError('');
    try {
      const reply = await saveLogEntry(project.projectCode, v, uploaded.map((f) => ({ name: f.name, url: f.url })));
      setV({ ...blank, Title: suggestTitle(project.log, 'Meeting') });
      setFiles([]);
      setMore(false);
      onSaved(reply.message ?? 'Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_9.5rem]">
        <select
          aria-label="Kind of entry"
          className={inputClass}
          value={v.Type}
          onChange={(e) => {
            const kind = e.target.value;
            setV((cur) => ({ ...cur, Type: kind, Title: !cur.Title || cur.Title === suggestTitle(project.log, cur.Type) ? suggestTitle(project.log, kind) : cur.Title }));
          }}
        >
          {options.logTypes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input aria-label="Title" className={inputClass} placeholder="Title, e.g. 2nd meeting – price negotiation" value={v.Title} onChange={(e) => set('Title', e.target.value)} />
        <input aria-label="Date" type="date" className={inputClass} value={v.Date} onChange={(e) => set('Date', e.target.value)} />
      </div>
      <textarea aria-label="Description" rows={3} className={`${inputClass} mt-3`} placeholder="What happened, what was agreed…" value={v.Summary} onChange={(e) => set('Summary', e.target.value)} />
      <textarea aria-label="Issues" rows={2} className={`${inputClass} mt-3`} placeholder="Open issues / risks (optional)" value={v.Issues} onChange={(e) => set('Issues', e.target.value)} />

      {more && (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <select aria-label="Project status" className={inputClass} value={v.Status} onChange={(e) => set('Status', e.target.value)}>
            <option value="">Status unchanged</option>
            {options.projectStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input aria-label="Progress %" type="number" min={0} max={100} className={inputClass} placeholder="Progress %" value={v.PhysicalProgressPct} onChange={(e) => set('PhysicalProgressPct', e.target.value)} />
          <input aria-label="Next step" className={inputClass} placeholder="Next step" value={v.NextMilestone} onChange={(e) => set('NextMilestone', e.target.value)} />
          <input aria-label="Next step date" type="date" className={inputClass} value={v.NextMilestoneDate} onChange={(e) => set('NextMilestoneDate', e.target.value)} />
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {files.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-2">
              <span className="truncate text-ink">📎 {f.name}</span>
              <span className={`shrink-0 text-xs ${f.state === 'error' ? 'text-critical' : 'text-muted'}`}>
                {f.state === 'uploading' ? 'Uploading…' : f.state === 'done' ? 'In Drive' : f.error}
                {f.state !== 'uploading' && (
                  <button type="button" className="ml-2 underline" onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))}>
                    remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={picker} type="file" multiple accept={ACCEPT_FILES} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <button type="button" onClick={() => picker.current?.click()} className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-chip">
          📎 Attach files
        </button>
        {uploaded.length > 0 && (
          <button type="button" onClick={draft} disabled={!!busy || uploading} className="rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-chip disabled:opacity-50">
            {busy === 'draft' ? 'Reading files…' : '✨ Draft from files'}
          </button>
        )}
        <button type="button" onClick={() => setMore((m) => !m)} className="text-sm text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
          {more ? 'Hide status & progress' : 'Also update status / progress / next step'}
        </button>
        <button type="button" onClick={save} disabled={!!busy || uploading} className="ml-auto rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          {busy === 'save' ? 'Saving…' : 'Add to log'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

function Timeline({ log, projectCode, onSaved }: { log: LogEntry[]; projectCode: string; onSaved: (message: string) => void }) {
  const edit = useEdit();
  if (!log.length) return <EmptyState title="No activity yet" hint="Add the first meeting, visit or update above." />;
  const remove = async (e: LogEntry) => {
    if (!window.confirm(`Delete "${e.title || e.type}" from ${fmtDate(e.timestamp)}? Attached files stay in Drive; the entry is kept in the AuditLog.`)) return;
    try {
      onSaved((await deleteLogEntry(projectCode, e)).message ?? 'Deleted.');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <ol className="relative space-y-5 border-l-2 border-line pl-5">
      {log.map((e, i) => (
        <li key={`${e.timestamp}-${i}`} className="relative">
          <span aria-hidden="true" className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-surface bg-brand" />
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Pill>{e.type || 'Update'}</Pill>
            <span className="tabular">{fmtDate(e.timestamp)}</span>
            {num(e.physicalProgressPct) !== null && <span className="tabular">· {num(e.physicalProgressPct)}%</span>}
            {e.submittedBy && <span className="truncate">· {e.submittedBy}</span>}
            {edit.enabled && e.row && (
              <button type="button" onClick={() => remove(e)} className="ml-auto text-xs text-muted underline decoration-line underline-offset-4 hover:text-critical">
                Delete
              </button>
            )}
          </div>
          {e.title && <p className="mt-1 font-medium text-ink">{e.title}</p>}
          {e.summary && <p className="mt-1 text-sm whitespace-pre-line text-ink">{e.summary}</p>}
          {e.issues && (
            <p className="mt-1 text-sm text-ink-2">
              <span className="font-medium">Issues:</span> {e.issues}
            </p>
          )}
          {e.nextMilestone && (
            <p className="mt-1 text-sm text-ink-2">
              <span className="font-medium">Next:</span> {e.nextMilestone}
              {e.nextMilestoneDate && ` · ${fmtDate(e.nextMilestoneDate)}`}
            </p>
          )}
          {(e.attachments?.length || e.link) && (
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {e.attachments?.map((a, j) => (
                <SafeLink key={j} url={a.url} safe={a.safe}>
                  📎 {a.name}
                </SafeLink>
              ))}
              {e.link && (
                <SafeLink url={e.link} safe={e.linkSafe}>
                  Attachment
                </SafeLink>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ProjectPage({ data, code, onSaved }: { data: DashboardData; code: string; onSaved: (message: string) => void }) {
  const edit = useEdit();
  const project = data.projects.find((p) => p.projectCode === code);
  if (!project) {
    return <EmptyState title={`Project ${code} was not found`} hint={<a href="#/projects" className="underline">Back to projects</a>} />;
  }
  const o = opts(data.options);
  const pct = num(project.physicalProgressPct);
  const update = updateBadge(project, data.staleUpdateDays);
  const milestone = milestoneBadge(project);
  const where = [project.client, project.location].filter(Boolean).join(' · ');

  return (
    <>
      <a href="#/projects" className="text-sm text-ink-2 hover:text-ink">
        ← All projects
      </a>
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="tabular text-xs font-medium text-muted">{project.projectCode}</div>
            <h2 className="font-heading text-2xl font-semibold text-ink">{project.name}</h2>
            {where && <p className="mt-0.5 text-sm text-ink-2">{where}</p>}
          </div>
          <div className="flex items-center gap-3">
            <Pill strong={project.status === 'Active'}>{project.status || 'No status'}</Pill>
            <RowAction
              onClick={() =>
                edit.open({
                  title: `Edit ${project.projectCode}`,
                  fields: projectFields(o),
                  initial: fromRaw(project.raw),
                  submit: (v) => saveEdit('project', project.projectCode, v),
                  remove: {
                    label: `project ${project.projectCode} (its log entries stay in the sheet)`,
                    run: async () => {
                      const reply = await deleteRecord('project', project.projectCode);
                      window.location.hash = '#/projects';
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
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted">Physical progress</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-series-1-track">
                <div className="h-full rounded-full bg-series-1" style={{ width: `${clampPct(pct)}%` }} />
              </div>
              <span className="tabular font-semibold text-ink">{pct === null ? '—' : `${Math.round(clampPct(pct))}%`}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted">Next step</div>
            <div className="mt-1 text-ink">
              {project.nextMilestone || <span className="text-muted">Not set</span>}
              {project.nextMilestoneDate && <span className="text-ink-2"> · {fmtDate(project.nextMilestoneDate)}{project.nextMilestoneDaysLeft !== null && !milestone ? ` (${relDays(project.nextMilestoneDaysLeft)})` : ''}</span>}
            </div>
            {milestone && <div className="mt-1"><StatusChip tone={milestone.tone} label={milestone.label} /></div>}
          </div>
          <div>
            <div className="text-xs text-muted">Latest activity</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <StatusChip tone={update.tone} label={update.label} />
              <SafeLink url={project.driveFolderUrl} safe={project.driveFolderUrlSafe}>
                Drive folder
              </SafeLink>
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="Activity log" count={project.log.length}>
          <div className="space-y-5 py-1">
            {edit.enabled && <EntryComposer key={project.projectCode} project={project} options={o} onSaved={onSaved} />}
            <Timeline log={project.log} projectCode={project.projectCode} onSaved={onSaved} />
          </div>
        </Panel>
        <div className="lg:sticky lg:top-4">
          <Advisor projectCode={project.projectCode} title="Ask about this project" />
        </div>
      </div>
    </>
  );
}
