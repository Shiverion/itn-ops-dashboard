import { useCallback, useEffect, useState } from 'react';
import { canEdit, DEMO, loadDashboard, SignInRequired } from './api';
import { DemoBanner, DemoSignIn } from './demo/DemoSignIn';
import { Advisor } from './components/Advisor';
import { CertificatesPanel } from './components/CertificatesPanel';
import { ContractsPanel } from './components/ContractsPanel';
import { EditProvider } from './components/edit';
import { FinancePanel } from './components/FinancePanel';
import { Header } from './components/Header';
import { InvoicesPanel } from './components/InvoicesPanel';
import { KpiRow } from './components/KpiRow';
import { ProjectPage } from './components/ProjectPage';
import { ProjectsPanel } from './components/ProjectsPanel';
import { RevenueKpis, RevenuePanel } from './components/RevenuePanel';
import { SignIn } from './components/SignIn';
import { TaxAlert, TaxesPanel, urgentTaxes } from './components/TaxesPanel';
import { TenderPage } from './components/TenderPage';
import { TendersPanel } from './components/TendersPanel';
import { Skeleton } from './components/ui';
import type { DashboardData } from './types';

type State =
  | { status: 'loading' }
  | { status: 'signin'; reason: string }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: DashboardData };

// Each section is its own page, addressed by the URL hash (#/taxes), so the
// phone's Back button and bookmarks work.
type View = 'overview' | 'ask' | 'revenue' | 'projects' | 'tenders' | 'certificates' | 'taxes' | 'contracts';
const VIEWS: { key: View; label: string; finance?: boolean; editOnly?: boolean }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'ask', label: 'Ask ITN', editOnly: true },
  { key: 'revenue', label: 'Revenue', finance: true },
  { key: 'projects', label: 'Projects' },
  { key: 'tenders', label: 'Tenders' },
  { key: 'certificates', label: 'Certificates' },
  { key: 'taxes', label: 'Taxes', finance: true },
  { key: 'contracts', label: 'Contracts', finance: true },
];

interface Route {
  view: View;
  /** A project code (#/projects/P-2026-001) or tender ID (#/tenders/T-2026-011). */
  item: string | null;
}

function routeFromHash(): Route {
  const [key, item] = window.location.hash.replace(/^#\/?/, '').split('/');
  const view = VIEWS.some((v) => v.key === key) ? (key as View) : 'overview';
  return { view, item: item ? decodeURIComponent(item) : null };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(routeFromHash);
  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <Skeleton className="h-4 w-28" />
      <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

function Tabs({ view, data }: { view: View; data: DashboardData | null }) {
  const finance = data ? data.finance !== null : false;
  const urgent = urgentTaxes(data?.taxes).length;
  return (
    <nav aria-label="Pages" className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px text-sm">
      {VIEWS.filter((v) => (!v.finance || finance) && (!v.editOnly || canEdit())).map((v) => {
        const active = v.key === view;
        return (
          <a
            key={v.key}
            href={`#/${v.key}`}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 font-medium ${
              active ? 'border-brand text-ink' : 'border-transparent text-ink-2 hover:border-line hover:text-ink'
            }`}
          >
            {v.label}
            {v.key === 'taxes' && urgent > 0 && (
              <span className="tabular grid min-w-5 place-items-center rounded-full bg-critical px-1.5 text-[11px] leading-5 font-semibold text-white" aria-label={`${urgent} need attention`}>
                {urgent}
              </span>
            )}
          </a>
        );
      })}
    </nav>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-40 mx-auto w-fit max-w-[90vw] rounded-lg bg-ink px-4 py-2.5 text-sm text-surface shadow-lg">
      {message}
    </div>
  );
}

function Page({ route, data, onSaved }: { route: Route; data: DashboardData; onSaved: (message: string) => void }) {
  const codes = data.projects.map((p) => p.projectCode).filter(Boolean);
  const finance = data.finance !== null;
  switch (route.view) {
    case 'ask':
      return <Advisor title="Ask ITN" tall />;
    case 'revenue':
      return finance ? (
        <>
          {data.revenue && <RevenueKpis revenue={data.revenue} />}
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <RevenuePanel data={data} />
            <InvoicesPanel data={data} />
          </div>
          {data.finance && <FinancePanel rows={data.finance} financeSheet={data.financeSheet} projectCodes={codes} />}
        </>
      ) : null;
    case 'projects':
      if (route.item) return <ProjectPage data={data} code={route.item} onSaved={onSaved} />;
      return <ProjectsPanel projects={data.projects} staleDays={data.staleUpdateDays} opsSheet={data.opsSheet} options={data.options} />;
    case 'tenders':
      if (route.item) return <TenderPage data={data} id={route.item} />;
      return <TendersPanel tenders={data.tenders} options={data.options} projectCodes={codes} emails={data.tenderEmails} />;
    case 'certificates':
      return <CertificatesPanel evidence={data.evidence} options={data.options} />;
    case 'taxes':
      return finance ? (
        <>
          <TaxAlert taxes={data.taxes} linkToTaxes={false} />
          <TaxesPanel data={data} />
        </>
      ) : null;
    case 'contracts':
      return finance ? <ContractsPanel data={data} /> : null;
    default:
      return (
        <>
          <TaxAlert taxes={data.taxes} />
          {data.revenue && <RevenueKpis revenue={data.revenue} />}
          <KpiRow data={data} />
          {data.revenue ? (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
              <RevenuePanel data={data} />
              <TendersPanel tenders={data.tenders} options={data.options} projectCodes={codes} emails={data.tenderEmails} />
            </div>
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <TendersPanel tenders={data.tenders} options={data.options} projectCodes={codes} emails={data.tenderEmails} />
              <CertificatesPanel evidence={data.evidence} options={data.options} />
            </div>
          )}
        </>
      );
  }
}

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [toast, setToast] = useState('');
  const route = useRoute();

  const load = useCallback((quiet = false) => {
    if (!quiet) setState({ status: 'loading' });
    loadDashboard().then(
      (data) => setState({ status: 'ready', data }),
      (error: Error) =>
        setState(error instanceof SignInRequired ? { status: 'signin', reason: error.message } : { status: 'error', message: error.message }),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSaved = useCallback(
    (message: string) => {
      setToast(message);
      load(true); // reload quietly so the page shows what the sheet now holds
    },
    [load],
  );

  const data = state.status === 'ready' ? state.data : null;

  return (
    <EditProvider onSaved={onSaved}>
      <div className="min-h-screen">
        <Header data={data} onSignedOut={() => setState({ status: 'signin', reason: 'Signed out.' })} />
        <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {state.status === 'signin' ? (
            DEMO ? (
              <DemoSignIn onSignedIn={() => load()} />
            ) : (
              <SignIn onSignedIn={() => load()} reason={state.reason} />
            )
          ) : state.status === 'error' ? (
            <div role="alert" className="rounded-xl border border-critical/40 bg-surface p-5">
              <p className="font-medium text-ink">The dashboard couldn’t load its data.</p>
              <p className="mt-1 text-sm break-words text-ink-2">{state.message}</p>
              <p className="mt-3 text-sm text-muted">Reload the page. If it keeps happening, send this message to the ITN Ops admin.</p>
            </div>
          ) : (
            <>
              {DEMO && <DemoBanner onReset={() => load(true)} />}
              <Tabs view={route.view} data={data} />
              {data ? (
                <Page route={route} data={data} onSaved={onSaved} />
              ) : (
                <>
                  <KpiRow data={null} />
                  <PanelSkeleton rows={3} />
                </>
              )}
            </>
          )}
        </main>
        <footer className="mx-auto max-w-[1400px] px-4 pb-8 text-xs text-muted sm:px-6 lg:px-8">
          {DEMO
            ? 'Demo with a fictional company: changes are kept in this browser only. The real dashboard saves them to the company’s Google Sheets, with an audit log.'
            : canEdit()
            ? 'Changes made here are saved straight to the Operations and Finance sheets, as you, and recorded in their AuditLog.'
            : 'Read-only view. To change anything, edit the Operations sheet or submit the weekly update form.'}
        </footer>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </EditProvider>
  );
}
