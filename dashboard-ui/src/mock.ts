// Fictional sample data for `npm run dev` only (never in the production
// build). Dates are relative to today so countdowns look realistic.
// Add ?empty to the dev URL for the empty state, ?nofinance to hide Finance.
import type { DashboardData, TaxRow, TaxState } from './types';

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const drive = 'https://drive.google.com/drive/folders/example';

export function mockData(search: string): DashboardData {
  const params = new URLSearchParams(search);
  const base: DashboardData = {
    viewerEmail: 'you@example.com',
    generatedAt: '3 Oct 2026, 09:15',
    opsSheet: { url: 'https://docs.google.com/spreadsheets/d/example/edit', safe: true },
    financeSheet: { url: 'https://docs.google.com/spreadsheets/d/example2/edit', safe: true },
    staleUpdateDays: 14,
    projects: [
      {
        projectCode: 'P-2026-003', name: 'Gas Metering Station Upgrade', client: 'PT Contoh Energi Nusantara',
        location: 'Dumai, Riau', status: 'Active', pmEmail: 'rudi@example.com', physicalProgressPct: 62,
        lastUpdateAgeDays: 3, nextMilestone: 'Mechanical completion', nextMilestoneDate: day(9), nextMilestoneDaysLeft: 9,
        driveFolderUrl: drive, driveFolderUrlSafe: true, aliases: 'GMS Dumai',
        log: [
          { timestamp: `${day(-1)} 14:00`, type: 'Meeting', title: '2nd meeting – price negotiation', physicalProgressPct: '', summary: 'Client asked for a 5% discount on the change order. Agreed to send a revised quotation.', issues: 'Margin below target if the full 5% is given.', nextMilestone: 'Send revised quotation', nextMilestoneDate: day(6), link: '', linkSafe: false, submittedBy: 'you@example.com', attachments: [{ name: 'MoM meeting 2.pdf', url: drive, safe: true }, { name: 'Site photo.jpg', url: drive, safe: true }] },
          { timestamp: `${day(-3)} 16:40`, type: 'Update', physicalProgressPct: 62, summary: 'Piping tie-ins 80% complete; hydrotest scheduled.', issues: 'Two valves delayed at supplier.', nextMilestone: 'Mechanical completion', nextMilestoneDate: day(9), link: drive, linkSafe: true },
          { timestamp: `${day(-10)} 10:05`, type: 'Milestone', physicalProgressPct: 55, summary: 'Civil works handed over.', issues: '', nextMilestone: '', nextMilestoneDate: '', link: '', linkSafe: false },
        ],
      },
      {
        projectCode: 'P-2026-004', name: 'Tank Farm Fire Protection Retrofit', client: 'PT Sampel Petrokimia',
        location: 'Cilegon, Banten', status: 'Active', pmEmail: 'sari@example.com', physicalProgressPct: 28,
        lastUpdateAgeDays: 19, nextMilestone: 'Deluge valve installation', nextMilestoneDate: day(-2), nextMilestoneDaysLeft: -2,
        driveFolderUrl: drive, driveFolderUrlSafe: true, aliases: '',
        log: [
          { timestamp: `${day(-19)} 09:12`, type: 'Issue', physicalProgressPct: 28, summary: 'Permit-to-work suspended pending HSE audit.', issues: 'Client HSE audit not yet scheduled.', nextMilestone: 'Deluge valve installation', nextMilestoneDate: day(-2), link: '', linkSafe: false },
        ],
      },
      {
        projectCode: 'P-2026-005', name: 'Substation Control Building', client: 'PT Ilustrasi Daya',
        location: 'Balikpapan, Kalimantan Timur', status: 'Prospect', pmEmail: '', physicalProgressPct: '',
        lastUpdateAgeDays: null, nextMilestone: 'Kick-off meeting', nextMilestoneDate: day(21), nextMilestoneDaysLeft: 21,
        driveFolderUrl: '', driveFolderUrlSafe: false, aliases: 'SCB Balikpapan', log: [],
      },
    ],
    tenders: [
      {
        tenderId: 'T-2026-011', title: 'EPC Compressor Package Relocation', buyer: 'PT Contoh Energi Nusantara', status: 'Preparing',
        ownerEmail: 'andi@example.com', nextStage: { key: 'QnADeadline', label: 'Q&A', date: day(2), daysLeft: 2 },
        documentsUrl: drive, documentsUrlSafe: true, linkedProjectCode: '',
      },
      {
        tenderId: 'T-2026-012', title: 'Pipeline Cathodic Protection Survey', buyer: 'PT Sampel Migas', status: 'Registered',
        ownerEmail: 'andi@example.com', nextStage: { key: 'SubmissionDeadline', label: 'Submission', date: day(6), daysLeft: 6 },
        documentsUrl: '', documentsUrlSafe: false, linkedProjectCode: '',
      },
      {
        tenderId: 'T-2026-009', title: 'Water Treatment Plant Expansion', buyer: 'PDAM Contoh', status: 'Screening',
        ownerEmail: '', nextStage: { key: 'AanwijzingDate', label: 'Aanwijzing', date: day(18), daysLeft: 18 },
        documentsUrl: '', documentsUrlSafe: false, linkedProjectCode: '',
      },
      {
        tenderId: 'T-2026-007', title: 'Jetty Fender Replacement', buyer: 'PT Pelabuhan Ilustrasi', status: 'Lost',
        ownerEmail: '', nextStage: null, documentsUrl: '', documentsUrlSafe: false, linkedProjectCode: '',
      },
    ],
    evidence: [
      { type: 'SBU', nameOrNumber: 'SBU Konstruksi BS001', issuer: 'LPJK', scope: 'Bangunan industri', validFrom: day(-700), validUntil: day(-5), documentUrl: drive, documentUrlSafe: true, ownerEmail: '', status: 'Expired', daysLeft: -5 },
      { type: 'ISO', nameOrNumber: 'ISO 45001:2018', issuer: 'Contoh Certification', scope: 'EPC services', validFrom: day(-1000), validUntil: day(24), documentUrl: drive, documentUrlSafe: true, ownerEmail: '', status: 'Expiring', daysLeft: 24 },
      { type: 'SMK3', nameOrNumber: 'SMK3 Lanjutan', issuer: 'Kemnaker', scope: '', validFrom: day(-300), validUntil: day(51), documentUrl: '', documentUrlSafe: false, ownerEmail: '', status: 'Expiring', daysLeft: 51 },
      { type: 'NIB', nameOrNumber: 'NIB 1234567890123', issuer: 'OSS', scope: '', validFrom: day(-900), validUntil: '', documentUrl: '', documentUrlSafe: false, ownerEmail: '', status: 'No expiry', daysLeft: null },
      { type: 'ISO', nameOrNumber: 'ISO 9001:2015', issuer: 'Contoh Certification', scope: 'EPC services', validFrom: day(-400), validUntil: day(420), documentUrl: drive, documentUrlSafe: true, ownerEmail: '', status: 'Valid', daysLeft: 420 },
    ],
    finance: [
      { projectCode: 'P-2026-003', projectName: 'Gas Metering Station Upgrade', contractValue: 18_400_000_000, currency: 'IDR', billedPct: 0.45, paidPct: 0.3, physicalProgressPct: 62, lastInvoiceDate: day(-12) },
      { projectCode: 'P-2026-004', projectName: 'Tank Farm Fire Protection Retrofit', contractValue: 7_250_000_000, currency: 'IDR', billedPct: 0.3, paidPct: 0.3, physicalProgressPct: 28, lastInvoiceDate: day(-40) },
    ],
  };

  // Extra rows so the 4-per-page panels have something to page through.
  for (let i = 1; i <= 7; i++) {
    base.evidence.push({ type: 'Other', nameOrNumber: `SKK Pelaksana Lapangan – Staff ${i}`, issuer: 'LPJK', scope: '', validFrom: day(-200), validUntil: day(60 + i * 90), documentUrl: '', documentUrlSafe: false, ownerEmail: '', status: i === 1 ? 'Expiring' : 'Valid', daysLeft: 60 + i * 90 });
    base.tenders.push({ tenderId: `T-2026-0${20 + i}`, title: `RFQ 0${40 + i} – Safety equipment package ${i} for ISBL and OSBL areas, RDMP Balikpapan`, buyer: 'RDMP Balikpapan JO', status: i % 2 ? 'Submitted' : 'No-Go', ownerEmail: '', nextStage: null, documentsUrl: '', documentsUrlSafe: false, linkedProjectCode: '' });
  }

  // Editable fields for the edit forms (the server sends the real sheet rows).
  for (const p of base.projects) {
    p.raw = { ProjectCode: p.projectCode, Name: p.name, Client: p.client, Location: p.location, Status: p.status, PMEmail: p.pmEmail, PhysicalProgressPct: p.physicalProgressPct, NextMilestone: p.nextMilestone, NextMilestoneDate: p.nextMilestoneDate };
  }
  for (const t of base.tenders) t.raw = { TenderID: t.tenderId, Title: t.title, Buyer: t.buyer, Status: t.status };
  for (const c of base.evidence) {
    c.key = `E|${c.type}|${c.nameOrNumber}|${c.validUntil}`.toLowerCase();
    c.raw = { Type: c.type, NameOrNumber: c.nameOrNumber, Issuer: c.issuer, ValidUntil: c.validUntil };
  }

  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const thisYear = [1.2, 0.8, 2.1, 0, 1.6, 2.4, 1.1, 3.0, 1.9, 0.7, 0, 0].map((v, i) => (i < month ? v * 1e9 : 0));
  const lastYear = [0.9, 1.1, 0.6, 1.4, 0.8, 1.9, 2.2, 1.0, 1.5, 1.8, 2.6, 3.1].map((v) => v * 1e9);
  base.revenue = {
    year, month,
    invoicedByMonth: thisYear,
    invoicedLastYearByMonth: lastYear,
    collectedByMonth: thisYear.map((v) => v * 0.7),
    invoicedYtd: thisYear.reduce((a, b) => a + b, 0),
    invoicedLastYearToDate: lastYear.slice(0, month).reduce((a, b) => a + b, 0) * 0.9,
    collectedThisYear: thisYear.reduce((a, b) => a + b, 0) * 0.7,
    outstandingTotal: 3_450_000_000,
    overdueTotal: 1_210_000_000,
    agingBuckets: { 'Not yet due': 2_240_000_000, Undated: 0, '0-30': 640_000_000, '31-60': 0, '61-90': 570_000_000, '90+': 0 },
    backlog: 12_300_000_000,
    activeContractValue: 25_650_000_000,
    contractsByYear: [
      { year: 2022, total: 64_000_000, count: 1 },
      { year: 2023, total: 1_320_000_000, count: 1 },
      { year: 2024, total: 2_450_000_000, count: 1 },
    ],
    contractsUndated: { total: 1_880_000_000, count: 1 },
    contractsTotal: 5_714_000_000,
    contractsCount: 4,
  };
  const inv = (no: string, code: string, name: string, date: number, amount: number, paid: number, due: number, overdue: number) => ({
    invoiceNo: no, projectCode: code, projectName: name, invoiceDate: day(date), dueDate: day(due), amount, paidAmount: paid,
    paidDate: paid ? day(date + 20) : '', outstanding: amount - paid, daysOverdue: overdue,
    raw: { InvoiceNo: no, ProjectCode: code, InvoiceDate: day(date), Amount: amount, DueDate: day(due), PaidAmount: paid || '' },
  });
  base.invoices = [
    inv('INV-2026-014', 'P-2026-003', 'Gas Metering Station Upgrade', -95, 570_000_000, 0, -65, 65),
    inv('INV-2026-018', 'P-2026-004', 'Tank Farm Fire Protection Retrofit', -40, 640_000_000, 0, -10, 10),
    inv('INV-2026-021', 'P-2026-003', 'Gas Metering Station Upgrade', -12, 2_240_000_000, 0, 18, 0),
    inv('INV-2026-009', 'P-2026-003', 'Gas Metering Station Upgrade', -150, 1_900_000_000, 1_900_000_000, -120, 0),
  ];
  const contract = (no: string, title: string, client: string, value: number, date: string) => ({
    contractNo: no, title, client, projectCode: '', value, contractDate: date, completionDate: '', documentType: 'Purchase Order',
    documentUrl: drive, documentUrlSafe: true, raw: { ContractNo: no, Title: title, Client: client, ContractValue: value, ContractDate: date },
  });
  base.contracts = [
    contract('PO-2024-118', 'Supply of phenolic-film plywood and formwork timber – refinery expansion', 'PT Contoh Kilang', 2_450_000_000, '2024-03-12'),
    contract('SC-2023-041', 'Subcontract – drainage sand works, airport apron', 'PT Ilustrasi Karya', 1_880_000_000, ''),
    contract('PO-2023-207', 'Embankment and excavation works – toll road section', 'PT Sampel Infrastruktur', 1_320_000_000, '2023-11-02'),
    contract('RA-2022-009', 'Rental of 25 kVA generator set with accessories', 'PT Contoh Kilang', 64_000_000, '2022-08-01'),
  ];
  const tax = (type: string, period: string, payDue: string, reportDue: string, state: TaxState, label: string, daysLeft: number | null, extra: Partial<TaxRow> = {}): TaxRow => ({
    taxId: `${type.replace(/[^A-Za-z0-9]/g, '')}-${period}`, taxType: type, period, amount: null, payDueDate: payDue, paidDate: '',
    reportDueDate: reportDue, reportedDate: '', billingCode: '', ntpn: '', statusOverride: '',
    status: { state, action: state === 'done' ? null : 'Pay', due: payDue, daysLeft, label },
    raw: { TaxType: type, Period: period, PayDueDate: payDue, ReportDueDate: reportDue }, ...extra,
  });
  base.taxes = [
    tax('PPh 21', '2026-08', day(-3), day(2), 'overdue', 'Pay overdue by 3 days', -3, { amount: 4_250_000 }),
    tax('PPh 23', '2026-09', day(2), day(7), 'due-soon', 'Pay due in 2 days', 2),
    tax('PPh 4(2)', '2026-09', day(12), day(17), 'upcoming', `Pay by ${day(12)}`, 12, { statusOverride: '' }),
    tax('PPN', '2026-09', day(28), day(28), 'upcoming', `Pay by ${day(28)}`, 28),
    tax('PPh 25', '2026-08', day(-18), day(-13), 'done', 'Paid and reported', null, { paidDate: day(-20), reportedDate: day(-15), amount: 12_000_000, ntpn: '0A1B2C3D4E5F6G7H' }),
  ];
  base.options = {
    projectStatuses: ['Prospect', 'Active', 'On Hold', 'Completed', 'Closed'],
    logTypes: ['Update', 'Meeting', 'Site visit', 'Quotation', 'Negotiation', 'Contract', 'Mobilization', 'Milestone', 'Issue', 'Decision', 'Handover', 'Payment', 'Document', 'Note'],
    evidenceTypes: ['SBU', 'ISO', 'SMK3', 'NIB', 'NPWP', 'KBLI', 'CSMS', 'Vendor Registration', 'Other'],
    tenderStatuses: ['New', 'Screening', 'Go', 'No-Go', 'Submitted', 'Won', 'Lost', 'Cancelled'],
    currencies: ['IDR'],
    taxTypes: ['PPN', 'PPh 4(2)', 'PPh 21', 'PPh 23', 'PPh 25', 'SPT Tahunan Badan'],
    taxStatuses: ['', 'Nil return', 'Withheld by client', 'Not applicable'],
  };

  if (params.has('empty')) {
    return { ...base, projects: [], tenders: [], evidence: [], finance: [], invoices: [], contracts: [], taxes: [] };
  }
  if (params.has('nofinance')) {
    return { ...base, finance: null, financeSheet: null, revenue: null, invoices: null, contracts: null, taxes: null };
  }
  return base;
}
