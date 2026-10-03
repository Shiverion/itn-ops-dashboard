/**
 * Config.js (dashboard project) — sheet names, column schemas and option
 * lists for the dashboard. Also loaded by the web server (web/server.mjs),
 * which edits these sheets for signed-in viewers. The schemas and lists must
 * match admin/src/Config.js (a test checks).
 */

var SHEET_PROJECTS = 'Projects';
var SHEET_PROJECT_LOG = 'ProjectLog';
var SHEET_EVIDENCE = 'Evidence';
var SHEET_TENDERS = 'Tenders';
var SHEET_CONFIG = 'Config';
var SHEET_PROJECT_FINANCE = 'ProjectFinance';
var SHEET_INVOICES = 'Invoices';
var SHEET_CONTRACTS = 'Contracts';
var SHEET_TAXES = 'Taxes';
var SHEET_AUDIT_LOG = 'AuditLog';

var SCRIPT_PROP_OPS_ID = 'OPS_SPREADSHEET_ID';
var SCRIPT_PROP_FINANCE_ID = 'FINANCE_SPREADSHEET_ID';

var COLUMNS = {
  Projects: [
    'ProjectCode', 'Name', 'Client', 'Location', 'Status', 'PMEmail',
    'StartDate', 'PlannedEndDate', 'PhysicalProgressPct', 'LastUpdateDate',
    'NextMilestone', 'NextMilestoneDate', 'DriveFolderURL', 'GmailLabel',
    'Aliases', 'Notes'
  ],
  ProjectLog: [
    'Timestamp', 'ProjectCode', 'Type', 'PhysicalProgressPct', 'Summary',
    'Issues', 'NextMilestone', 'NextMilestoneDate', 'Link', 'SubmittedBy',
    'Title', 'Attachments'
  ],
  Evidence: [
    'Type', 'NameOrNumber', 'Issuer', 'Scope', 'ValidFrom', 'ValidUntil',
    'DocumentURL', 'OwnerEmail', 'Status'
  ],
  Tenders: [
    'TenderID', 'Title', 'Buyer', 'PortalOrSource', 'ReferenceNo',
    'RegistrationDeadline', 'AanwijzingDate', 'QnADeadline',
    'SubmissionDeadline', 'Status', 'OwnerEmail', 'LastAddendumDate',
    'AddendumNotes', 'DocumentsURL', 'ScreeningSummary', 'LinkedProjectCode'
  ],
  Config: ['Key', 'Value'],
  ProjectFinance: [
    'ProjectCode', 'ContractValue', 'Currency', 'BilledToDate', 'PaidToDate',
    'BilledPct', 'PaidPct', 'LastInvoiceDate', 'ERPExportDate', 'Notes'
  ],
  Invoices: [
    'InvoiceNo', 'ProjectCode', 'InvoiceDate', 'Amount', 'Currency',
    'DueDate', 'PaidDate', 'PaidAmount', 'Notes'
  ],
  Contracts: [
    'ContractNo', 'Title', 'Client', 'ProjectCode', 'ContractValue', 'Currency',
    'ContractDate', 'CompletionDate', 'DocumentType', 'DocumentURL', 'Notes'
  ],
  Taxes: [
    'TaxID', 'TaxType', 'Period', 'Amount', 'PayDueDate', 'PaidDate',
    'BillingCode', 'NTPN', 'ReportDueDate', 'ReportedDate', 'Status', 'Notes'
  ],
  AuditLog: ['Timestamp', 'Actor', 'Action', 'Details']
};

var PROJECT_STATUSES = ['Prospect', 'Active', 'On Hold', 'Completed', 'Closed'];
// Kinds of project log entries: the weekly form writes "Update"; the dashboard
// offers all of them (a meeting, a negotiation round, a site visit…).
var LOG_TYPES = [
  'Update', 'Meeting', 'Site visit', 'Quotation', 'Negotiation', 'Contract', 'Mobilization',
  'Milestone', 'Issue', 'Decision', 'Handover', 'Payment', 'Document', 'Note'
];
var EVIDENCE_TYPES = [
  'SBU', 'ISO', 'SMK3', 'NIB', 'NPWP', 'KBLI', 'CSMS', 'Vendor Registration', 'Other'
];
var TENDER_STATUSES = [
  'New', 'Screening', 'Go', 'No-Go', 'Submitted', 'Won', 'Lost', 'Cancelled'
];
var CURRENCY_OPTIONS = ['IDR'];
// Tax types tracked in the Finance sheet's Taxes tab. Monthly types have a
// "YYYY-MM" Period; the annual return has a "YYYY" Period (taxDueDates in Logic.js).
var TAX_TYPES = ['PPN', 'PPh 4(2)', 'PPh 21', 'PPh 23', 'PPh 25', 'SPT Tahunan Badan'];
// Status overrides; blank = work it out from PaidDate/ReportedDate.
var TAX_STATUSES = ['', 'Nil return', 'Withheld by client', 'Not applicable'];


// Columns that hold dates. The Sheets API returns dates as serial numbers, so
// the dashboard converts these columns (and only these) to date strings. Must
// match the columns admin/src/Setup.js gives date validation; a test checks.
var DATE_COLUMNS = {
  Projects: ['StartDate', 'PlannedEndDate', 'LastUpdateDate', 'NextMilestoneDate'],
  ProjectLog: ['NextMilestoneDate'],
  Evidence: ['ValidFrom', 'ValidUntil'],
  Tenders: ['RegistrationDeadline', 'AanwijzingDate', 'QnADeadline', 'SubmissionDeadline', 'LastAddendumDate'],
  ProjectFinance: ['LastInvoiceDate', 'ERPExportDate'],
  Invoices: ['InvoiceDate', 'DueDate', 'PaidDate'],
  Contracts: ['ContractDate', 'CompletionDate'],
  Taxes: ['PayDueDate', 'PaidDate', 'ReportDueDate', 'ReportedDate']
};
var DATE_TIME_COLUMNS = {
  ProjectLog: ['Timestamp'],
  AuditLog: ['Timestamp']
};

var DEFAULT_STALE_UPDATE_DAYS = 14;

// Cloud Run service that starts the knowledge update (cloud/refresh_app.py).
// Not a secret: it only acts on a Google ID token of a signed-in ITN user.
var REFRESH_SERVICE_URL = 'https://<your-refresh-service>.run.app';

var TIME_ZONE = 'Asia/Jakarta';

if (typeof module !== 'undefined') {
  module.exports = {
    SHEET_PROJECTS: SHEET_PROJECTS,
    SHEET_PROJECT_LOG: SHEET_PROJECT_LOG,
    SHEET_EVIDENCE: SHEET_EVIDENCE,
    SHEET_TENDERS: SHEET_TENDERS,
    SHEET_CONFIG: SHEET_CONFIG,
    SHEET_PROJECT_FINANCE: SHEET_PROJECT_FINANCE,
    SHEET_INVOICES: SHEET_INVOICES,
    SHEET_CONTRACTS: SHEET_CONTRACTS,
    SHEET_TAXES: SHEET_TAXES,
    SHEET_AUDIT_LOG: SHEET_AUDIT_LOG,
    SCRIPT_PROP_OPS_ID: SCRIPT_PROP_OPS_ID,
    SCRIPT_PROP_FINANCE_ID: SCRIPT_PROP_FINANCE_ID,
    COLUMNS: COLUMNS,
    DATE_COLUMNS: DATE_COLUMNS,
    DATE_TIME_COLUMNS: DATE_TIME_COLUMNS,
    DEFAULT_STALE_UPDATE_DAYS: DEFAULT_STALE_UPDATE_DAYS,
    PROJECT_STATUSES: PROJECT_STATUSES,
    LOG_TYPES: LOG_TYPES,
    EVIDENCE_TYPES: EVIDENCE_TYPES,
    TENDER_STATUSES: TENDER_STATUSES,
    CURRENCY_OPTIONS: CURRENCY_OPTIONS,
    TAX_TYPES: TAX_TYPES,
    TAX_STATUSES: TAX_STATUSES,
    TIME_ZONE: TIME_ZONE
  };
}
