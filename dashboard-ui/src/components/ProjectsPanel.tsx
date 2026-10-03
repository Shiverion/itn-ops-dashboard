import { useMemo, useState } from 'react';
import { deleteRecord, saveEdit } from '../api';
import { clampPct, fmtDate, num, relDays } from '../format';
import { opts, projectFields } from '../forms';
import { isActive, milestoneBadge, sortProjects, updateBadge } from '../summary';
import type { Options, Project, SheetLink } from '../types';
import { AddButton, RowAction, fromRaw, useEdit } from './edit';
import { EmptyState, Panel, Pill, SafeLink, StatusChip } from './ui';

function ProgressMeter({ value }: { value: number | null }) {
  const pct = clampPct(value);
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-2">Physical progress</span>
        <span className="tabular text-sm font-semibold text-ink">{value === null ? '—' : `${Math.round(pct)}%`}</span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-series-1-track"
        role="progressbar"
        aria-label="Physical progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(pct)}
      >
        <div className="h-full rounded-full bg-series-1" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ActivityLog({ project }: { project: Project }) {
  if (!project.log.length) return <p className="py-2 text-sm text-muted">No weekly updates submitted yet.</p>;
  return (
    <ol className="space-y-3">
      {project.log.map((entry, i) => (
        <li key={`${entry.timestamp}-${i}`} className="border-l-2 border-line pl-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Pill>{entry.type || 'Update'}</Pill>
            <span className="tabular">{fmtDate(entry.timestamp)}</span>
            {num(entry.physicalProgressPct) !== null && <span className="tabular">· {num(entry.physicalProgressPct)}%</span>}
          </div>
          {entry.summary && <p className="mt-1 text-sm text-ink">{entry.summary}</p>}
          {entry.issues && (
            <p className="mt-1 text-sm text-ink-2">
              <span className="font-medium">Issues:</span> {entry.issues}
            </p>
          )}
          {entry.nextMilestone && (
            <p className="mt-1 text-sm text-ink-2">
              <span className="font-medium">Next:</span> {entry.nextMilestone}
              {entry.nextMilestoneDate && ` · ${fmtDate(entry.nextMilestoneDate)}`}
            </p>
          )}
          {entry.link && (
            <p className="mt-1 text-sm">
              <SafeLink url={entry.link} safe={entry.linkSafe}>
                Attachment
              </SafeLink>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function ProjectCard({ project, staleDays, options }: { project: Project; staleDays: number; options: Options }) {
  const [open, setOpen] = useState(false);
  const edit = useEdit();
  const update = updateBadge(project, staleDays);
  const milestone = milestoneBadge(project);
  const where = [project.client, project.location].filter(Boolean).join(' · ');

  return (
    <article className="flex flex-col rounded-lg border border-line bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="tabular text-xs font-medium text-muted">{project.projectCode}</div>
          <h3 className="mt-0.5 font-heading text-base leading-snug font-semibold text-ink">
            <a href={`#/projects/${encodeURIComponent(project.projectCode)}`} className="hover:text-brand hover:underline">
              {project.name || 'Untitled project'}
            </a>
          </h3>
          {where && <p className="mt-0.5 truncate text-sm text-ink-2" title={where}>{where}</p>}
        </div>
        <Pill strong={isActive(project)}>{project.status || 'No status'}</Pill>
      </div>

      <ProgressMeter value={num(project.physicalProgressPct)} />

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Next milestone</dt>
          <dd className="mt-0.5 text-ink">
            {project.nextMilestone || <span className="text-muted">Not set</span>}
            {project.nextMilestoneDate && (
              <span className="block text-xs text-ink-2">
                {fmtDate(project.nextMilestoneDate)}
                {project.nextMilestoneDaysLeft !== null && !milestone && ` · ${relDays(project.nextMilestoneDaysLeft)}`}
              </span>
            )}
            {milestone && (
              <span className="mt-1 block">
                <StatusChip tone={milestone.tone} label={milestone.label} />
              </span>
            )}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Latest update</dt>
          <dd className="mt-1">
            <StatusChip tone={update.tone} label={update.label} />
          </dd>
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 font-medium text-ink hover:text-brand"
        >
          <span aria-hidden="true" className={`inline-block text-muted transition-transform ${open ? 'rotate-90' : ''}`}>
            ▸
          </span>
          Activity <span className="tabular text-muted">({project.log.length})</span>
        </button>
        <SafeLink url={project.driveFolderUrl} safe={project.driveFolderUrlSafe}>
          Drive folder
        </SafeLink>
        <a href={`#/projects/${encodeURIComponent(project.projectCode)}`} className="text-xs font-medium text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
          Open log &amp; advisor
        </a>
        <RowAction
          onClick={() =>
            edit.open({
              title: `Edit ${project.projectCode}`,
              fields: projectFields(options),
              initial: fromRaw(project.raw),
              submit: (v) => saveEdit('project', project.projectCode, v),
              remove: { label: `project ${project.projectCode} (its log entries stay in the sheet)`, run: () => deleteRecord('project', project.projectCode) },
            })
          }
        >
          Edit
        </RowAction>
        {project.pmEmail && <span className="ml-auto truncate text-xs text-muted">PM · {project.pmEmail}</span>}
      </div>
      {open && (
        <div className="mt-3">
          <ActivityLog project={project} />
        </div>
      )}
    </article>
  );
}

export function ProjectsPanel({
  projects,
  staleDays,
  opsSheet,
  options,
}: {
  projects: Project[];
  staleDays: number;
  opsSheet: SheetLink | null;
  options?: Options | null;
}) {
  const [query, setQuery] = useState('');
  const edit = useEdit();
  const o = opts(options);
  const newProject = () =>
    edit.open({ title: 'New project', fields: projectFields(o), initial: { Status: 'Prospect' }, submit: (v) => saveEdit('project', null, v) });
  const sorted = useMemo(() => sortProjects(projects), [projects]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? sorted.filter((p) => `${p.projectCode} ${p.name} ${p.aliases || ''}`.toLowerCase().includes(q))
    : sorted;

  return (
    <Panel
      title="Projects"
      count={projects.length}
      id="projects"
      actions={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {projects.length > 0 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by code, name or alias"
              aria-label="Filter projects"
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:border-ink/40 focus:outline-none sm:w-64"
            />
          )}
          <AddButton onClick={newProject}>Project</AddButton>
        </div>
      }
    >
      {!projects.length ? (
        <EmptyState
          title="No projects yet"
          hint={
            <>
              Add your first project in the <strong>Projects</strong> tab of the{' '}
              {opsSheet ? (
                <SafeLink url={opsSheet.url} safe={opsSheet.safe}>
                  Operations sheet
                </SafeLink>
              ) : (
                'Operations sheet'
              )}
              .
            </>
          }
        />
      ) : !shown.length ? (
        <EmptyState title={`No projects match “${query.trim()}”`} />
      ) : (
        <div className="grid gap-4 py-1 xl:grid-cols-2">
          {shown.map((p) => (
            <ProjectCard key={p.projectCode || p.name} project={p} staleDays={staleDays} options={o} />
          ))}
        </div>
      )}
    </Panel>
  );
}
