import { relDays } from '../format';
import { isActive, needsRenewal, needsUpdate, splitTenders, tenderTone } from '../summary';
import type { DashboardData } from '../types';
import { Skeleton, StatTile, StatusChip } from './ui';

export function KpiRow({ data }: { data: DashboardData | null }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-8 w-12" />
            <Skeleton className="mt-3 h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  const active = data.projects.filter(isActive);
  const stale = active.filter((p) => needsUpdate(p, data.staleUpdateDays));
  const thisWeek = splitTenders(data.tenders).upcoming.filter((t) => (t.nextStage?.daysLeft ?? 99) <= 7);
  const soonest = thisWeek[0];
  const renew = data.evidence.filter(needsRenewal);
  const expired = renew.filter((c) => c.status === 'Expired' || c.status === 'Invalid date').length;
  const nextExpiry = renew
    .filter((c) => c.status === 'Expiring' && c.daysLeft !== null)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))[0];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile
        label="Active projects"
        href="#/projects"
        value={active.length}
        sub={`${data.projects.length} ${data.projects.length === 1 ? 'project' : 'projects'} in the register`}
      />
      <StatTile
        label="Need an update"
        href="#/projects"
        value={stale.length}
        sub={
          stale.length ? (
            <StatusChip tone="warning" label={`No update in ${data.staleUpdateDays}+ days`} />
          ) : (
            <StatusChip tone="good" label={active.length ? 'All updated recently' : 'Nothing to update'} />
          )
        }
      />
      <StatTile
        label="Tender dates this week"
        href="#/tenders"
        value={thisWeek.length}
        sub={
          soonest && soonest.nextStage ? (
            <StatusChip
              tone={tenderTone(soonest.nextStage.daysLeft)}
              label={`${soonest.nextStage.label} ${relDays(soonest.nextStage.daysLeft)}`}
            />
          ) : (
            'None in the next 7 days'
          )
        }
      />
      <StatTile
        label="Certificates to renew"
        href="#/certificates"
        value={renew.length}
        sub={
          expired ? (
            <StatusChip tone="critical" label={`${expired} expired or unreadable`} />
          ) : nextExpiry ? (
            <StatusChip tone={(nextExpiry.daysLeft ?? 99) <= 30 ? 'serious' : 'warning'} label={`Next expires ${relDays(nextExpiry.daysLeft)}`} />
          ) : (
            <StatusChip tone="good" label={data.evidence.length ? 'All valid' : 'None tracked yet'} />
          )
        }
      />
    </div>
  );
}
