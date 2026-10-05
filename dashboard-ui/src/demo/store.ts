// The demo's "database": the fictional sheets from seed.ts, kept in this
// browser (localStorage), changed only through the same shared rules the real
// server uses (planEdit, planDelete, validateLogEntry in shared/Logic.js) and
// turned into the dashboard with the same buildDashboardPayload. Nothing is
// shared between visitors; "Reset demo data" starts over.
import Config from '../../../dashboard/src/Config.js';
import Logic from '../../../shared/Logic.js';
import type { DashboardData } from '../types';
import { seedSheets, type Cell, type Sheets } from './seed';

const KEY = 'itn-demo-data-v1';
let sheets: Sheets | null = null;

const OPTIONS = {
  projectStatuses: Config.PROJECT_STATUSES,
  logTypes: Config.LOG_TYPES,
  evidenceTypes: Config.EVIDENCE_TYPES,
  tenderStatuses: Config.TENDER_STATUSES,
  currencies: Config.CURRENCY_OPTIONS,
  taxTypes: Config.TAX_TYPES,
  taxStatuses: Config.TAX_STATUSES,
};
const CTX = () => ({ columns: Config.COLUMNS, dateColumns: Config.DATE_COLUMNS, lists: OPTIONS, projectCodes: projectCodes(), now: new Date() });

function data(): Sheets {
  if (sheets) return sheets;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) sheets = JSON.parse(saved) as Sheets;
  } catch {
    sheets = null;
  }
  sheets ??= seedSheets();
  return sheets;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sheets));
  } catch {
    /* private window or full storage: changes last until the tab closes */
  }
}

export function resetDemoData(): void {
  sheets = seedSheets();
  persist();
}

function projectCodes(): string[] {
  return data().Projects.slice(1).map((r) => String(r[0] || '').trim()).filter(Boolean);
}

/** The ProjectFinance formula columns (billed/paid to date, %), as the real sheet's ARRAYFORMULAs compute them. */
function financeWithFormulas(): Cell[][] {
  const cols: string[] = Config.COLUMNS.ProjectFinance;
  const inv: string[] = Config.COLUMNS.Invoices;
  const ix = (c: string) => cols.indexOf(c);
  const invoices = data().Invoices.slice(1);
  return data().ProjectFinance.map((row, i) => {
    if (i === 0) return row;
    const code = row[ix('ProjectCode')];
    const mine = invoices.filter((r) => r[inv.indexOf('ProjectCode')] === code);
    const billed = mine.reduce((s, r) => s + (Number(r[inv.indexOf('Amount')]) || 0), 0);
    const paid = mine.reduce((s, r) => s + (Number(r[inv.indexOf('PaidAmount')]) || 0), 0);
    const value = Number(row[ix('ContractValue')]) || 0;
    const last = Math.max(0, ...mine.map((r) => Number(r[inv.indexOf('InvoiceDate')]) || 0));
    const out = [...row];
    while (out.length < cols.length) out.push('');
    out[ix('BilledToDate')] = billed;
    out[ix('PaidToDate')] = paid;
    out[ix('BilledPct')] = value ? billed / value : '';
    out[ix('PaidPct')] = value ? paid / value : '';
    out[ix('LastInvoiceDate')] = last || '';
    return out;
  });
}

export function demoPayload(viewerEmail: string): DashboardData {
  const s = data();
  const now = new Date();
  const generatedAt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now)
    .replace(' at ', ', ');
  return Logic.buildDashboardPayload({
    ops: { Projects: s.Projects, ProjectLog: s.ProjectLog, Tenders: s.Tenders, Evidence: s.Evidence, Config: s.Config },
    finance: financeWithFormulas(),
    financeExtra: { Invoices: s.Invoices, Contracts: s.Contracts, Taxes: s.Taxes },
    schema: { columns: Config.COLUMNS, dateColumns: Config.DATE_COLUMNS, dateTimeColumns: Config.DATE_TIME_COLUMNS, defaultStaleDays: Config.DEFAULT_STALE_UPDATE_DAYS },
    options: OPTIONS,
    now,
    generatedAt,
    viewerEmail,
    opsSheet: null,
    financeSheet: null,
  }) as DashboardData;
}

/** Writes planned cells into a sheet: dates (YYYY-MM-DD) become serial numbers, as the real sheet stores them. */
function apply(sheetName: string, rowNumber: number, cells: Record<string, Cell>, dateCells: string[]): void {
  const values = data()[sheetName];
  const cols: string[] = Config.COLUMNS[sheetName];
  while (values.length < rowNumber) values.push([]);
  const row = values[rowNumber - 1];
  while (row.length < cols.length) row.push('');
  for (const [column, value] of Object.entries(cells)) {
    row[cols.indexOf(column)] = dateCells.includes(column) && value !== '' ? Logic.isoToSheetSerial(String(value)) : value;
  }
}

export interface DemoReply {
  ok: boolean;
  message: string;
  id?: string;
}

export function demoEdit(kind: string, id: string | null, fields: Record<string, string>): DemoReply {
  const target = Logic.EDIT_TARGETS[kind];
  if (!target) throw new Error('Unknown kind of edit.');
  const plan = Logic.planEdit(kind, data()[target.sheet], { id, fields }, CTX());
  if (plan.errors) throw new Error(plan.errors.join('. ') + '.');
  if (!Object.keys(plan.cells).length) return { ok: true, id: plan.id, message: 'Nothing to change.' };
  apply(plan.sheet, plan.row, plan.cells, plan.dateCells);
  persist();
  return { ok: true, id: plan.id, message: plan.created ? `Added ${plan.id}.` : `Saved ${plan.id}.` };
}

export function demoDelete(kind: string, id: string): DemoReply {
  const plan = Logic.planDelete(kind, data()[Logic.EDIT_TARGETS[kind]?.sheet], id, CTX());
  if (plan.errors) throw new Error(plan.errors.join('. '));
  data()[plan.sheet].splice(plan.row - 1, 1);
  persist();
  return { ok: true, message: `Deleted ${plan.id}.` };
}

export function demoDeleteLog(projectCode: string, row: number | undefined, timestamp: string): DemoReply {
  const plan = Logic.planDeleteLogEntry(data().ProjectLog, { row, projectCode, timestamp }, CTX());
  if (plan.errors) throw new Error(plan.errors.join('. '));
  data().ProjectLog.splice(plan.row - 1, 1);
  persist();
  return { ok: true, message: 'Deleted the log entry.' };
}

export function demoLogEntry(projectCode: string, entry: Record<string, string>, attachments: { name: string; url: string }[]): DemoReply {
  const errors = Logic.validateLogEntry({ ...entry, attachments }, OPTIONS);
  if (errors.length) throw new Error(errors.join('. ') + '.');
  const text = (k: string) => String(entry[k] ?? '').trim();
  const now = new Date();
  const fields: Record<string, string> = { LastUpdateDate: Logic.jakartaToday(now) };
  for (const k of ['Status', 'PhysicalProgressPct', 'NextMilestone', 'NextMilestoneDate']) if (text(k)) fields[k] = text(k);
  demoEdit('project', projectCode, fields);

  const nowSerial: number = Logic.instantToSheetSerial(now);
  const timestamp = text('Date') ? Logic.isoToSheetSerial(text('Date')) + (nowSerial % 1) : nowSerial;
  const cols: string[] = Config.COLUMNS.ProjectLog;
  const rec: Record<string, Cell> = {
    Timestamp: timestamp, ProjectCode: projectCode, Type: text('Type'),
    PhysicalProgressPct: text('PhysicalProgressPct') ? Number(text('PhysicalProgressPct')) : '',
    Summary: text('Summary'), Issues: text('Issues'), NextMilestone: text('NextMilestone'),
    NextMilestoneDate: text('NextMilestoneDate') ? Logic.isoToSheetSerial(text('NextMilestoneDate')) : '',
    SubmittedBy: 'demo@example.com', Title: text('Title'), Attachments: Logic.formatAttachments(attachments),
  };
  const log = data().ProjectLog;
  log.splice(Logic.lastUsedRowIndex(log) + 1, 0, cols.map((c) => rec[c] ?? ''));
  persist();
  return { ok: true, message: `Added to ${projectCode}'s log.` };
}
