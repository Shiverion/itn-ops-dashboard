import { clearToken, idToken, type Gsi } from './auth';
import { demoAsk, demoDraft, demoUpload, demoUser } from './demo/session';
import { demoDelete, demoDeleteLog, demoEdit, demoLogEntry, demoPayload } from './demo/store';
import type { DashboardData } from './types';

interface ScriptRun {
  withSuccessHandler(fn: (value: unknown) => void): ScriptRun;
  withFailureHandler(fn: (error: unknown) => void): ScriptRun;
  getDashboardData(): void;
  requestRefresh(): void;
  getRefreshStatus(): void;
}

declare global {
  interface Window {
    google?: { script?: { run?: ScriptRun }; accounts?: { id?: Gsi } };
  }
}

export interface RefreshReply {
  ok: boolean;
  message?: string;
  running?: boolean;
  last?: { started?: string; finished?: string; result?: string; new_items?: number; facts?: number } | null;
}

/** Thrown when the viewer must sign in (again) on the web version. */
export class SignInRequired extends Error {}

/**
 * Where the page runs. The same build serves three places:
 * - "apps-script": inside the Apps Script web app (google.script.run exists).
 * - "web": ops.itnconstruction.com (web/server.mjs), signed in with Google.
 * - "mock": `npm run dev`, with sample data (dropped from the production build).
 */
/** True only in `--mode demo` builds; a constant, so other builds drop the demo code entirely. */
export const DEMO = import.meta.env.VITE_DEMO === '1';

export function runtime(): 'apps-script' | 'web' | 'mock' | 'demo' {
  if (DEMO) return 'demo';
  if (window.google?.script?.run) return 'apps-script';
  return import.meta.env.DEV ? 'mock' : 'web';
}

/** Calls the web server's API with the viewer's Google ID token. */
async function webApi<T>(method: 'GET' | 'POST', path: string): Promise<T> {
  const token = idToken();
  if (!token) throw new SignInRequired('Please sign in.');
  const res = await fetch(path, { method, headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (res.status === 401) {
    clearToken();
    throw new SignInRequired(body.message ?? 'Please sign in again.');
  }
  if (!res.ok) throw new Error(body.message ?? `The dashboard server answered ${res.status}.`);
  return body;
}

export interface SaveReply {
  ok: boolean;
  message?: string;
  id?: string;
}

export type EditKind = 'project' | 'tender' | 'evidence' | 'invoice' | 'contract' | 'tax' | 'projectFinance';

/** Editing works on the web version (and in the dev preview, where saves are pretend). */
export function canEdit(): boolean {
  return runtime() !== 'apps-script';
}

/** The demo (fictional data in this browser): the same requests, answered by demo/store.ts. */
function demoSave(path: string, body: Record<string, unknown>): SaveReply {
  if (path === '/api/edit') return demoEdit(String(body.kind), (body.id as string) ?? null, (body.fields as Record<string, string>) ?? {});
  if (path === '/api/log') return demoLogEntry(String(body.projectCode), (body.entry as Record<string, string>) ?? {}, (body.attachments as Attachment[]) ?? []);
  if (body.kind === 'log') return demoDeleteLog(String(body.projectCode), body.row as number | undefined, String(body.timestamp));
  return demoDelete(String(body.kind), String(body.id));
}

async function save(path: string, body: unknown): Promise<SaveReply> {
  if (DEMO) {
    await new Promise((r) => setTimeout(r, 250));
    return demoSave(path, body as Record<string, unknown>);
  }
  if (runtime() === 'mock') {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, message: 'Saved (preview only, nothing was written).' };
  }
  const token = idToken();
  if (!token) throw new SignInRequired('Please sign in again.');
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const reply = (await res.json().catch(() => ({}))) as SaveReply;
  if (res.status === 401) {
    clearToken();
    throw new SignInRequired(reply.message ?? 'Please sign in again.');
  }
  if (!res.ok || !reply.ok) throw new Error(reply.message ?? `The dashboard server answered ${res.status}.`);
  return reply;
}

/** Adds (no id) or changes (id) one row: a project, tender, certificate, invoice, contract, tax period or contract value. */
export function saveEdit(kind: EditKind, id: string | null, fields: Record<string, string>): Promise<SaveReply> {
  return save('/api/edit', { kind, id, fields });
}

export interface Attachment {
  name: string;
  url: string;
}

/** Adds an entry to a project's activity log (and updates status/progress/milestone if given). */
export function saveLogEntry(projectCode: string, entry: Record<string, string>, attachments: Attachment[]): Promise<SaveReply> {
  return save('/api/log', { projectCode, entry, attachments });
}

export interface UploadedFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
}

const EXT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
};
export const ACCEPT_FILES = Object.keys(EXT_TYPES).map((e) => `.${e}`).join(',');
export const MAX_FILE_MB = 20;

/** Uploads one file to the ITN Ops Files shared drive: a project's folder, or Certificates/<type>. */
export async function uploadFile(file: File, target: { project: string } | { certificateType: string }): Promise<UploadedFile> {
  const type = file.type || EXT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] || '';
  if (!type || !Object.values(EXT_TYPES).includes(type)) throw new Error(`${file.name}: this kind of file can’t be uploaded.`);
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
  if (DEMO) return demoUpload(file);
  if (runtime() === 'mock') {
    await new Promise((r) => setTimeout(r, 600));
    return { id: `mock-${file.name}`, name: file.name, mimeType: type, url: 'https://drive.google.com/file/d/mockfile123456/view' };
  }
  const token = idToken();
  if (!token) throw new SignInRequired('Please sign in again.');
  const qs = 'project' in target ? `target=project&code=${encodeURIComponent(target.project)}` : `target=certificate&type=${encodeURIComponent(target.certificateType)}`;
  const res = await fetch(`/api/upload?${qs}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': type, 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
  const reply = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; file?: UploadedFile };
  if (res.status === 401) {
    clearToken();
    throw new SignInRequired(reply.message ?? 'Please sign in again.');
  }
  if (!res.ok || !reply.file) throw new Error(reply.message ?? `Upload failed (${res.status}).`);
  return reply.file;
}

async function aiCall<T>(path: string, body: unknown, mock: T): Promise<T> {
  if (runtime() === 'mock') {
    await new Promise((r) => setTimeout(r, 900));
    return mock;
  }
  const token = idToken();
  if (!token) throw new SignInRequired('Please sign in again.');
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const reply = (await res.json().catch(() => ({}))) as T & { ok?: boolean; message?: string };
  if (res.status === 401) {
    clearToken();
    throw new SignInRequired(reply.message ?? 'Please sign in again.');
  }
  if (!res.ok || !reply.ok) throw new Error(reply.message ?? `The AI request failed (${res.status}).`);
  return reply;
}

/** AI reads uploaded files and drafts a log entry (kind "log") or certificate fields (kind "certificate"). */
export function draftFromFiles(kind: 'log' | 'certificate', fileIds: string[], projectCode?: string): Promise<{ draft: Record<string, string> }> {
  if (DEMO) return demoDraft(kind, fileIds).then((draft) => ({ draft }));
  const mock: Record<string, string> =
    kind === 'log'
      ? { Type: 'Meeting', Title: '2nd meeting – price negotiation', Summary: 'Client asked for a 5% discount on RFQ 012. ITN to send a revised quotation.', Issues: 'Margin below target if the full 5% is given.', Date: new Date().toISOString().slice(0, 10), NextMilestone: 'Send revised quotation', NextMilestoneDate: '' }
      : { Type: 'ISO', NameOrNumber: 'ISO 9001:2015 – Cert. No. QMS-12345', Issuer: 'Contoh Certification', Scope: 'EPC services', ValidFrom: '2025-01-10', ValidUntil: '2028-01-09', Notes: '' };
  return aiCall('/api/ai/draft', { kind, fileIds, projectCode }, { draft: mock });
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Asks the AI advisor about one project (projectCode) or the whole business.
 * The answer streams in: onDelta gets each piece as it is written; the promise
 * resolves with the full answer.
 */
export async function askAdvisor(question: string, history: ChatMessage[], projectCode: string | undefined, onDelta: (text: string) => void): Promise<string> {
  if (DEMO) return demoAsk(question, history, projectCode, lastDemoData ?? (await loadDashboard()), onDelta);
  if (runtime() === 'mock') {
    const answer =
      '**Preview answer.** Based on the 2nd meeting entry:\n\n- Send the revised quotation with a 3% discount and a shorter payment term.\n- Ask the client to confirm the award date in writing.\n- Book the site survey for next week.';
    for (const word of answer.split(/(?<= )/)) {
      await new Promise((r) => setTimeout(r, 25));
      onDelta(word);
    }
    return answer;
  }
  const token = idToken();
  if (!token) throw new SignInRequired('Please sign in again.');
  const res = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, projectCode }),
  });
  if (!res.ok || !res.body) {
    const reply = (await res.json().catch(() => ({}))) as { message?: string };
    if (res.status === 401) {
      clearToken();
      throw new SignInRequired(reply.message ?? 'Please sign in again.');
    }
    throw new Error(reply.message ?? `The AI request failed (${res.status}).`);
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

/** Deletes one row: a register row by its ID (certificates: their key). Its contents stay in the AuditLog. */
export function deleteRecord(kind: EditKind, id: string): Promise<SaveReply> {
  return save('/api/delete', { kind, id });
}

/** Deletes one project log entry (its attached files stay in Drive). */
export function deleteLogEntry(projectCode: string, entry: { row?: number; timestamp: string }): Promise<SaveReply> {
  return save('/api/delete', { kind: 'log', projectCode, row: entry.row, timestamp: entry.timestamp });
}

/** Calls a server function that returns a RefreshReply (the "Refresh knowledge" button). */
export function callRefresh(name: 'requestRefresh' | 'getRefreshStatus'): Promise<RefreshReply> {
  const mode = runtime();
  if (DEMO) {
    return Promise.resolve(
      name === 'requestRefresh'
        ? { ok: true, message: 'Demo: in the real dashboard this pulls new emails and files into Ask ITN.' }
        : { ok: true, running: false, last: { finished: new Date(Date.now() - 2 * 3600_000).toISOString(), result: 'updated' } },
    );
  }
  if (mode === 'web') {
    return webApi<RefreshReply>(name === 'requestRefresh' ? 'POST' : 'GET', name === 'requestRefresh' ? '/api/refresh' : '/api/status').catch(
      (error: Error) => ({ ok: false, message: error.message }),
    );
  }
  const run = window.google?.script?.run;
  if (mode === 'mock' || !run) {
    return Promise.resolve(
      name === 'requestRefresh'
        ? { ok: true, message: 'Update started. New emails and files appear in about 10 minutes. (preview)' }
        : { ok: true, running: false, last: { finished: new Date(Date.now() - 3 * 3600_000).toISOString(), result: 'updated' } },
    );
  }
  return new Promise((resolve) => {
    run
      .withSuccessHandler((reply) => resolve((reply as RefreshReply) ?? { ok: false, message: 'No answer.' }))
      .withFailureHandler((error) => resolve({ ok: false, message: error instanceof Error ? error.message : String(error) }))
      [name]();
  });
}

/**
 * Loads the dashboard payload: from getDashboardData() via google.script.run
 * inside Apps Script, from /api/dashboard on the web version, or sample data in
 * `npm run dev` (that branch and the sample data are dropped from the build).
 */
let lastDemoData: DashboardData | null = null;

export function loadDashboard(): Promise<DashboardData> {
  const mode = runtime();
  if (DEMO) {
    const user = demoUser();
    if (!user) return Promise.reject(new SignInRequired('Please sign in.'));
    lastDemoData = demoPayload(user);
    return Promise.resolve(lastDemoData);
  }
  if (mode === 'web') return webApi<DashboardData>('GET', '/api/dashboard');
  const run = window.google?.script?.run;
  if (mode === 'apps-script' && run) {
    return new Promise((resolve, reject) => {
      run
        .withSuccessHandler((data) => {
          if (data) resolve(data as DashboardData);
          else reject(new Error('No data returned.'));
        })
        .withFailureHandler((error) => {
          const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
          reject(new Error(message));
        })
        .getDashboardData();
    });
  }
  if (import.meta.env.DEV) {
    return import('./mock').then(
      (m) => new Promise<DashboardData>((resolve) => setTimeout(() => resolve(m.mockData(window.location.search)), 300)),
    );
  }
  return Promise.reject(new Error('This page must be opened from the dashboard link.'));
}
