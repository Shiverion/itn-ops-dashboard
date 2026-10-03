// Fields for each edit form. Names are the sheet column names (the server
// accepts only the columns listed for each kind in EDIT_TARGETS, Logic.js).
import type { FieldSpec } from './components/edit';
import type { Options } from './types';

const FALLBACK: Options = {
  projectStatuses: ['Prospect', 'Active', 'On Hold', 'Completed', 'Closed'],
  logTypes: ['Update', 'Meeting', 'Site visit', 'Quotation', 'Negotiation', 'Contract', 'Mobilization', 'Milestone', 'Issue', 'Decision', 'Handover', 'Payment', 'Document', 'Note'],
  evidenceTypes: ['SBU', 'ISO', 'SMK3', 'NIB', 'NPWP', 'KBLI', 'CSMS', 'Vendor Registration', 'Other'],
  tenderStatuses: ['New', 'Screening', 'Go', 'No-Go', 'Submitted', 'Won', 'Lost', 'Cancelled'],
  currencies: ['IDR'],
  taxTypes: ['PPN', 'PPh 4(2)', 'PPh 21', 'PPh 23', 'PPh 25', 'SPT Tahunan Badan'],
  taxStatuses: ['', 'Nil return', 'Withheld by client', 'Not applicable'],
};

export function opts(options: Options | null | undefined): Options {
  return options ?? FALLBACK;
}

export function today(): string {
  const d = new Date(Date.now() + 7 * 3600_000); // Jakarta
  return d.toISOString().slice(0, 10);
}

export function projectFields(o: Options): FieldSpec[] {
  return [
    { name: 'Name', label: 'Project name', required: true, wide: true },
    { name: 'Client', label: 'Client' },
    { name: 'Location', label: 'Location' },
    { name: 'Status', label: 'Status', type: 'select', options: o.projectStatuses, required: true },
    { name: 'PMEmail', label: 'Project manager email', type: 'email' },
    { name: 'StartDate', label: 'Start date', type: 'date' },
    { name: 'PlannedEndDate', label: 'Planned end date', type: 'date' },
    { name: 'PhysicalProgressPct', label: 'Physical progress (%)', type: 'number', min: 0, max: 100 },
    { name: 'NextMilestone', label: 'Next milestone' },
    { name: 'NextMilestoneDate', label: 'Next milestone date', type: 'date' },
    { name: 'DriveFolderURL', label: 'Drive folder link', type: 'url', wide: true },
    { name: 'Notes', label: 'Notes', type: 'textarea' },
  ];
}

export function tenderFields(o: Options, projectCodes: string[]): FieldSpec[] {
  return [
    { name: 'Title', label: 'Title', required: true, wide: true },
    { name: 'Buyer', label: 'Buyer' },
    { name: 'Status', label: 'Status', type: 'select', options: o.tenderStatuses, required: true },
    { name: 'ReferenceNo', label: 'Reference no.' },
    { name: 'PortalOrSource', label: 'Portal / source' },
    { name: 'RegistrationDeadline', label: 'Registration deadline', type: 'date' },
    { name: 'AanwijzingDate', label: 'Aanwijzing', type: 'date' },
    { name: 'QnADeadline', label: 'Q&A deadline', type: 'date' },
    { name: 'SubmissionDeadline', label: 'Submission deadline', type: 'date' },
    { name: 'OwnerEmail', label: 'Owner email', type: 'email' },
    { name: 'LinkedProjectCode', label: 'Linked project', type: 'select', options: projectCodes },
    { name: 'LastAddendumDate', label: 'Last addendum', type: 'date' },
    { name: 'DocumentsURL', label: 'Documents link', type: 'url' },
    { name: 'AddendumNotes', label: 'Addendum notes', type: 'textarea' },
    { name: 'ScreeningSummary', label: 'Screening summary', type: 'textarea' },
  ];
}

export function evidenceFields(o: Options): FieldSpec[] {
  return [
    { name: 'Type', label: 'Type', type: 'select', options: o.evidenceTypes, required: true },
    { name: 'NameOrNumber', label: 'Name / number', required: true },
    { name: 'Issuer', label: 'Issuer' },
    { name: 'Scope', label: 'Scope' },
    { name: 'ValidFrom', label: 'Valid from', type: 'date' },
    { name: 'ValidUntil', label: 'Valid until', type: 'date', hint: 'Leave empty if it never expires.' },
    { name: 'DocumentURL', label: 'Document link', type: 'url', wide: true },
    { name: 'OwnerEmail', label: 'Owner email (gets renewal reminders)', type: 'email', wide: true },
  ];
}

export function invoiceFields(projectCodes: string[], creating: boolean): FieldSpec[] {
  return [
    { name: 'InvoiceNo', label: 'Invoice no.', required: true, readOnly: !creating },
    { name: 'ProjectCode', label: 'Project', type: 'select', options: projectCodes, required: true },
    { name: 'InvoiceDate', label: 'Invoice date', type: 'date', required: true },
    { name: 'DueDate', label: 'Due date', type: 'date' },
    { name: 'Amount', label: 'Amount (Rp)', type: 'money', required: true },
    { name: 'PaidAmount', label: 'Paid amount (Rp)', type: 'money' },
    { name: 'PaidDate', label: 'Paid on', type: 'date' },
    { name: 'Notes', label: 'Notes', type: 'textarea' },
  ];
}

export function paymentFields(): FieldSpec[] {
  return [
    { name: 'PaidDate', label: 'Paid on', type: 'date', required: true },
    { name: 'PaidAmount', label: 'Paid amount (Rp)', type: 'money', required: true },
  ];
}

export function contractFields(projectCodes: string[], creating: boolean): FieldSpec[] {
  return [
    { name: 'ContractNo', label: 'Contract / PO no.', required: true, readOnly: !creating },
    { name: 'ContractValue', label: 'Contract value (Rp)', type: 'money', required: true },
    { name: 'Title', label: 'Title', required: true, wide: true },
    { name: 'Client', label: 'Client / contract owner' },
    { name: 'ProjectCode', label: 'Project', type: 'select', options: projectCodes },
    { name: 'ContractDate', label: 'Contract date', type: 'date' },
    { name: 'CompletionDate', label: 'Completion (BAST) date', type: 'date' },
    { name: 'DocumentType', label: 'Document type', hint: 'e.g. Purchase Order, BAST, Rental Agreement' },
    { name: 'DocumentURL', label: 'Document link', type: 'url' },
    { name: 'Notes', label: 'Notes', type: 'textarea' },
  ];
}

export function taxFields(o: Options, creating: boolean): FieldSpec[] {
  return [
    { name: 'TaxType', label: 'Tax', type: 'select', options: o.taxTypes, required: true, readOnly: !creating },
    { name: 'Period', label: 'Period', required: true, readOnly: !creating, hint: creating ? 'YYYY-MM, or YYYY for the annual return. Due dates fill in automatically.' : undefined },
    { name: 'Amount', label: 'Amount (Rp)', type: 'money' },
    { name: 'Status', label: 'Special case', type: 'select', options: o.taxStatuses },
    { name: 'PayDueDate', label: 'Pay by', type: 'date', required: !creating },
    { name: 'PaidDate', label: 'Paid on', type: 'date' },
    { name: 'BillingCode', label: 'Billing code' },
    { name: 'NTPN', label: 'NTPN' },
    { name: 'ReportDueDate', label: 'Report by', type: 'date', required: !creating },
    { name: 'ReportedDate', label: 'Reported on', type: 'date' },
    { name: 'Notes', label: 'Notes', type: 'textarea' },
  ];
}

export function taxPaidFields(): FieldSpec[] {
  return [
    { name: 'PaidDate', label: 'Paid on', type: 'date', required: true },
    { name: 'Amount', label: 'Amount (Rp)', type: 'money' },
    { name: 'BillingCode', label: 'Billing code' },
    { name: 'NTPN', label: 'NTPN', hint: 'From the payment receipt (BPN).' },
  ];
}

export function contractValueFields(projectCodes: string[], creating: boolean): FieldSpec[] {
  return [
    { name: 'ProjectCode', label: 'Project', type: 'select', options: projectCodes, required: true, readOnly: !creating },
    { name: 'ContractValue', label: 'Contract value (Rp)', type: 'money', required: true },
    { name: 'Notes', label: 'Notes', type: 'textarea' },
  ];
}
