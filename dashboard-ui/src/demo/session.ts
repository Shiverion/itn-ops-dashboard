// Demo sign-in and AI. The username/password are checked by the Vercel
// function api/login (they live in Vercel's environment, not in this code);
// it returns a signed session token that api/ask requires before calling the
// Kimi API. Uploads are simulated and file drafts are examples, so no real
// document is ever sent to an AI from the demo.
import type { ChatMessage } from '../api';
import type { DashboardData } from '../types';

const SESSION_KEY = 'itn-demo-session';

interface Session {
  token: string;
  username: string;
  expires: number;
}

function read(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Session | null;
    return s && s.expires > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function demoUser(): string | null {
  return read()?.username ?? null;
}

export function demoLogout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing stored */
  }
}

/** Checks the demo username and password with the server; throws a readable message when they're wrong. */
export async function demoLogin(username: string, password: string): Promise<void> {
  let session: Session;
  if (import.meta.env.DEV) {
    // `npm run dev:demo` has no serverless functions; accept any non-empty login locally.
    if (!username || !password) throw new Error('Enter a username and password.');
    session = { token: 'dev', username, expires: Date.now() + 12 * 3600_000 };
  } else {
    const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; token?: string; expires?: number; message?: string };
    if (!res.ok || !body.token) throw new Error(body.message ?? 'Sign-in failed.');
    session = { token: body.token, username, expires: body.expires ?? Date.now() + 12 * 3600_000 };
  }
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* session lasts until the tab closes */
  }
}

// --- AI -----------------------------------------------------------------------------

/** The records the advisor sees: one project in depth, or everything in summary (all fictional). */
function context(data: DashboardData, projectCode?: string): unknown {
  const logOf = (p: DashboardData['projects'][number], n: number) =>
    p.log.slice(0, n).map((e) => ({ when: e.timestamp, kind: e.type, title: e.title, summary: e.summary, issues: e.issues, next: e.nextMilestone, nextDate: e.nextMilestoneDate, files: (e.attachments || []).map((a) => a.name) }));
  const project = (p: DashboardData['projects'][number], n: number) => ({
    code: p.projectCode, name: p.name, client: p.client, location: p.location, status: p.status, progressPct: p.physicalProgressPct,
    nextMilestone: p.nextMilestone, nextMilestoneDate: p.nextMilestoneDate, daysSinceUpdate: p.lastUpdateAgeDays, log: logOf(p, n),
  });
  const tender = (t: DashboardData['tenders'][number]) => ({ id: t.tenderId, title: t.title, buyer: t.buyer, status: t.status, next: t.nextStage, linkedProject: t.linkedProjectCode });
  const strip = <T extends { raw?: unknown }>(list: T[] | null | undefined) => (list ?? []).map(({ raw, ...rest }) => rest);
  if (projectCode) {
    const p = data.projects.find((x) => x.projectCode === projectCode);
    return {
      project: p ? project(p, 40) : null,
      linkedTenders: data.tenders.filter((t) => t.linkedProjectCode === projectCode).map(tender),
      finance: (data.finance ?? []).filter((f) => f.projectCode === projectCode),
      invoices: strip((data.invoices ?? []).filter((i) => i.projectCode === projectCode)),
    };
  }
  return {
    projects: data.projects.map((p) => project(p, 6)),
    tenders: data.tenders.map(tender),
    certificates: data.evidence.map(({ raw, key, documentUrl, documentUrlSafe, ...c }) => c),
    revenue: data.revenue,
    invoices: strip(data.invoices).slice(0, 25),
    contracts: (data.contracts ?? []).map(({ raw, documentUrl, documentUrlSafe, ...c }) => ({ ...c, notes: raw?.Notes })),
    taxes: strip(data.taxes).map(({ taxType, period, amount, status }) => ({ taxType, period, amount, status: status.label })),
  };
}

/** Streams the advisor's answer from api/ask (Kimi). */
export async function demoAsk(question: string, history: ChatMessage[], projectCode: string | undefined, data: DashboardData, onDelta: (text: string) => void): Promise<string> {
  if (import.meta.env.DEV) {
    const answer = '**Local preview answer.** Deploy to Vercel (with the Kimi key) for real answers.\n\n- The prospect P-2026-004 needs the revised quotation within 4 days.\n- PPh 25 from two months ago is overdue.\n- The fender delivery on P-2026-001 is late.';
    for (const word of answer.split(/(?<= )/)) {
      await new Promise((r) => setTimeout(r, 20));
      onDelta(word);
    }
    return answer;
  }
  const session = read();
  if (!session) throw new Error('Please sign in again.');
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history: history.slice(-6), scope: projectCode ? `project ${projectCode}` : 'the whole business', context: context(data, projectCode) }),
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 401) demoLogout();
    throw new Error(body.message ?? `The demo AI answered ${res.status}.`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let answer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i);
      buffer = buffer.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { delta?: string; done?: boolean; answer?: string; error?: string };
      if (msg.error) throw new Error(msg.error);
      if (msg.delta) {
        answer += msg.delta;
        onDelta(msg.delta);
      }
      if (msg.done && msg.answer) answer = msg.answer;
    }
  }
  return answer;
}

// --- simulated uploads and example drafts ----------------------------------------------

let uploads = 0;
const uploadNames = new Map<string, string>();

export async function demoUpload(file: File): Promise<{ id: string; name: string; mimeType: string; url: string }> {
  await new Promise((r) => setTimeout(r, 500));
  uploads += 1;
  const id = `demo-${uploads}`;
  uploadNames.set(id, file.name);
  return { id, name: file.name, mimeType: file.type, url: `https://drive.google.com/file/d/demo-upload-${uploads}/view` };
}

export async function demoDraft(kind: 'log' | 'certificate', fileIds: string[]): Promise<Record<string, string>> {
  await new Promise((r) => setTimeout(r, 900));
  const name = fileIds.map((id) => uploadNames.get(id) ?? '').join(' ').toLowerCase();
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  if (kind === 'certificate') {
    const type = /sbu/.test(name) ? 'SBU' : /smk3/.test(name) ? 'SMK3' : /nib/.test(name) ? 'NIB' : 'ISO';
    return {
      Type: type,
      NameOrNumber: type === 'ISO' ? 'ISO 14001:2015 – Cert. No. EMS-20871' : `${type} – No. DEMO-0001`,
      Issuer: 'Contoh Certification',
      Scope: 'EPC and supply services',
      ValidFrom: today,
      ValidUntil: `${Number(today.slice(0, 4)) + 3}${today.slice(4)}`,
      Notes: 'Demo: an example draft. In the real dashboard the AI reads the uploaded scan.',
    };
  }
  const invoice = /invoice|faktur|inv/.test(name);
  return invoice
    ? { Type: 'Payment', Title: 'Payment received – progress claim', Summary: 'Example draft (demo): client transferred the progress-claim payment; matched to the open invoice.', Issues: '', Date: today, NextMilestone: '', NextMilestoneDate: '' }
    : { Type: 'Meeting', Title: 'Meeting – follow-up', Summary: 'Example draft (demo): the AI summarises the uploaded minutes here — decisions, prices discussed and who does what next.', Issues: 'Example: client wants a shorter schedule.', Date: today, NextMilestone: 'Send revised schedule', NextMilestoneDate: '' };
}
