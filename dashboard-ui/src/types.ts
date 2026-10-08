// The payload buildDashboardPayload (shared/Logic.js) returns, via the web
// server or the Apps Script dashboard. Cell values come straight from the
// sheets, so "number" fields can also arrive as '' (blank cell) or a string;
// format.ts coerces them before display. `raw` holds a row's sheet fields
// (dates as YYYY-MM-DD) for the edit forms.

export type Cell = string | number | boolean | '';

export type RawRow = Record<string, Cell>;

export interface SheetLink {
  url: string;
  safe: boolean;
}

export interface LogEntry {
  timestamp: string;
  type: string;
  physicalProgressPct: Cell;
  summary: string;
  issues: string;
  nextMilestone: string;
  nextMilestoneDate: string;
  link: string;
  linkSafe: boolean;
  title?: string;
  attachments?: { name: string; url: string; safe: boolean }[];
  submittedBy?: string;
  row?: number;
}

export interface Project {
  projectCode: string;
  name: string;
  client: string;
  location: string;
  status: string;
  pmEmail: string;
  physicalProgressPct: Cell;
  lastUpdateAgeDays: number | null;
  nextMilestone: string;
  nextMilestoneDate: string;
  nextMilestoneDaysLeft: number | null;
  driveFolderUrl: string;
  driveFolderUrlSafe: boolean;
  aliases: string;
  log: LogEntry[];
  raw?: RawRow;
}

export interface TenderStage {
  key: string;
  label: string;
  date: string;
  daysLeft: number;
}

export interface Tender {
  tenderId: string;
  title: string;
  buyer: string;
  status: string;
  ownerEmail: string;
  nextStage: TenderStage | null;
  documentsUrl: string;
  documentsUrlSafe: boolean;
  linkedProjectCode: string;
  raw?: RawRow;
}

export type CertificateStatus = 'Valid' | 'Expiring' | 'Expired' | 'No expiry' | 'Invalid date';

export interface Certificate {
  type: string;
  nameOrNumber: string;
  issuer: string;
  scope: string;
  validFrom: string;
  validUntil: string;
  documentUrl: string;
  documentUrlSafe: boolean;
  ownerEmail: string;
  status: CertificateStatus;
  daysLeft: number | null;
  key?: string;
  raw?: RawRow;
}

export interface FinanceRow {
  projectCode: string;
  projectName: string;
  contractValue: Cell;
  currency: string;
  billedPct: Cell;
  paidPct: Cell;
  physicalProgressPct: number;
  lastInvoiceDate: string;
}

export interface DashboardData {
  viewerEmail: string | null;
  generatedAt: string;
  opsSheet: SheetLink | null;
  financeSheet: SheetLink | null;
  staleUpdateDays: number;
  projects: Project[];
  tenders: Tender[];
  evidence: Certificate[];
  finance: FinanceRow[] | null;
  revenue?: Revenue | null;
  invoices?: Invoice[] | null;
  contracts?: Contract[] | null;
  taxes?: TaxRow[] | null;
  options?: Options | null;
  /** Email threads per project code, newest first (from the knowledge job; absent until it has run). */
  projectEmails?: Record<string, ProjectEmail[]> | null;
  /** Email threads per tender ID, newest first (same source). */
  tenderEmails?: Record<string, ProjectEmail[]> | null;
}

export interface ProjectEmail {
  id: string;
  /** Gmail link to the thread in the shared mailbox, or null if it isn't a plain Gmail link. */
  link: string | null;
  subject: string;
  first: string;
  last: string;
  messages: number;
  summary: string;
  counterparty: string;
  kind: string;
  documents: string[];
}

export interface Revenue {
  year: number;
  month: number;
  invoicedByMonth: number[];
  invoicedLastYearByMonth: number[];
  collectedByMonth: number[];
  invoicedYtd: number;
  invoicedLastYearToDate: number;
  collectedThisYear: number;
  outstandingTotal: number;
  overdueTotal: number;
  agingBuckets: Record<string, number>;
  backlog: number;
  activeContractValue: number;
  contractsByYear: { year: number; total: number; count: number }[];
  contractsUndated: { total: number; count: number };
  contractsTotal: number;
  contractsCount: number;
}

export interface Invoice {
  invoiceNo: string;
  projectCode: string;
  projectName: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidDate: string;
  outstanding: number;
  daysOverdue: number;
  raw: RawRow;
}

export interface Contract {
  contractNo: string;
  title: string;
  client: string;
  projectCode: string;
  value: number;
  contractDate: string;
  completionDate: string;
  documentType: string;
  documentUrl: string;
  documentUrlSafe: boolean;
  raw: RawRow;
}

export type TaxState = 'done' | 'overdue' | 'due-soon' | 'upcoming' | 'undated';

export interface TaxRow {
  taxId: string;
  taxType: string;
  period: string;
  amount: number | null;
  payDueDate: string;
  paidDate: string;
  reportDueDate: string;
  reportedDate: string;
  billingCode: string;
  ntpn: string;
  statusOverride: string;
  status: { state: TaxState; action: string | null; due: string | null; daysLeft: number | null; label: string };
  raw: RawRow;
}

export interface Options {
  projectStatuses: string[];
  logTypes: string[];
  evidenceTypes: string[];
  tenderStatuses: string[];
  currencies: string[];
  taxTypes: string[];
  taxStatuses: string[];
}
