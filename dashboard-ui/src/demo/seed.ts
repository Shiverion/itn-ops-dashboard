// Fictional company data for the stakeholder demo, shaped exactly like the
// real Google Sheets (header row + rows, dates as sheet serial numbers), and
// generated relative to today so deadlines, overdue invoices and tax alerts
// always look current. Every name, number and document here is made up.
import Config from '../../../dashboard/src/Config.js';
import Logic from '../../../shared/Logic.js';

export type Cell = string | number;
export type SheetValues = Cell[][];
export type Sheets = Record<string, SheetValues>;

const DOC = 'https://drive.google.com/drive/folders/demo-folder';
const FILE = (n: string) => `https://drive.google.com/file/d/demo-${n}/view`;

/** Deterministic pseudo-random numbers, so every visitor sees the same company. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function seedSheets(now = new Date()): Sheets {
  const today: number = Logic.isoToSheetSerial(Logic.jakartaToday(now));
  const d = (offset: number) => today + offset; // a date, `offset` days from today
  const at = (offset: number, h: number, m = 0) => today + offset + (h * 60 + m) / 1440; // a date and time
  const iso = (serial: number) => Logic.sheetSerialToString(serial, false) as string;
  const C = Config.COLUMNS as Record<string, string[]>;
  const row = (sheet: string, rec: Record<string, Cell | undefined>): Cell[] => C[sheet].map((c) => rec[c] ?? '');
  const sheet = (name: string, recs: Record<string, Cell | undefined>[]): SheetValues => [C[name], ...recs.map((r) => row(name, r))];

  // --- projects -------------------------------------------------------------------
  const projects = [
    { ProjectCode: 'P-2025-004', Name: 'Pipe Rack Fabrication – Refinery Unit 2', Client: 'PT Contoh Kilang Nusantara', Location: 'Balikpapan, Kalimantan Timur', Status: 'Active', PMEmail: 'rina@example.com', StartDate: d(-260), PlannedEndDate: d(75), PhysicalProgressPct: 72, LastUpdateDate: d(-2), NextMilestone: 'Hydrotest of rack modules 5–8', NextMilestoneDate: d(9), DriveFolderURL: DOC, Aliases: 'Pipe rack RU2', Notes: 'Lump-sum fabrication and erection, 640 t steel.' },
    { ProjectCode: 'P-2026-001', Name: 'Jetty Fender & Bollard Replacement', Client: 'PT Sampel Pelabuhan Indonesia', Location: 'Teluk Bayur, Sumatera Barat', Status: 'Active', PMEmail: 'agus@example.com', StartDate: d(-120), PlannedEndDate: d(110), PhysicalProgressPct: 35, LastUpdateDate: d(-19), NextMilestone: 'Delivery of 24 cone fenders', NextMilestoneDate: d(-3), DriveFolderURL: DOC, Aliases: 'Fender TB', Notes: '' },
    { ProjectCode: 'P-2026-002', Name: 'Gas Metering Station Upgrade', Client: 'PT Ilustrasi Energi', Location: 'Dumai, Riau', Status: 'Active', PMEmail: 'rina@example.com', StartDate: d(-150), PlannedEndDate: d(40), PhysicalProgressPct: 58, LastUpdateDate: d(-4), NextMilestone: 'Mechanical completion', NextMilestoneDate: d(16), DriveFolderURL: DOC, Aliases: 'GMS Dumai', Notes: '' },
    { ProjectCode: 'P-2026-003', Name: 'Tank Farm Fire Protection Retrofit', Client: 'PT Contoh Petrokimia', Location: 'Cilegon, Banten', Status: 'On Hold', PMEmail: 'agus@example.com', StartDate: d(-95), PlannedEndDate: d(150), PhysicalProgressPct: 20, LastUpdateDate: d(-27), NextMilestone: 'Client HSE re-audit', NextMilestoneDate: d(12), DriveFolderURL: DOC, Aliases: '', Notes: 'Paused by the client pending an HSE audit.' },
    { ProjectCode: 'P-2026-004', Name: 'Substation Control Building', Client: 'PT Sampel Daya Listrik', Location: 'Samarinda, Kalimantan Timur', Status: 'Prospect', PMEmail: 'dimas@example.com', StartDate: '', PlannedEndDate: '', PhysicalProgressPct: '', LastUpdateDate: d(-1), NextMilestone: 'Revised quotation due', NextMilestoneDate: d(4), DriveFolderURL: DOC, Aliases: 'SCB Samarinda', Notes: 'Design & build, two-storey control building.' },
    { ProjectCode: 'P-2025-002', Name: 'Refinery Turnaround Support – Scaffolding & Insulation', Client: 'PT Contoh Kilang Nusantara', Location: 'Balikpapan, Kalimantan Timur', Status: 'Completed', PMEmail: 'agus@example.com', StartDate: d(-480), PlannedEndDate: d(-330), PhysicalProgressPct: 100, LastUpdateDate: d(-325), NextMilestone: '', NextMilestoneDate: '', DriveFolderURL: DOC, Aliases: 'TA 2025', Notes: 'Unit-rate contract during the refinery turnaround.' },
    { ProjectCode: 'P-2024-007', Name: 'Toll Road Embankment Package', Client: 'PT Contoh Infrastruktur', Location: 'Jambi', Status: 'Completed', PMEmail: 'dimas@example.com', StartDate: d(-520), PlannedEndDate: d(-300), PhysicalProgressPct: 100, LastUpdateDate: d(-290), NextMilestone: '', NextMilestoneDate: '', DriveFolderURL: DOC, Aliases: '', Notes: 'Common borrow embankment, 22,500 m3.' },
  ];

  // --- activity logs ------------------------------------------------------------------
  type Log = Record<string, Cell>;
  const log = (code: string, day: number, h: number, Type: string, Title: string, Summary: string, extra: Partial<Log> = {}): Log => ({
    Timestamp: at(day, h), ProjectCode: code, Type, Title, Summary, SubmittedBy: extra.SubmittedBy ?? 'rina@example.com', ...extra,
  });
  const logs: Log[] = [
    // Prospect: the sales story, meeting by meeting.
    log('P-2026-004', -34, 10, 'Meeting', '1st meeting – introduction', 'Met the client’s engineering manager. Scope: two-storey control building, 18 × 32 m, with cable trench and grounding. Budget expected in Q1.', { SubmittedBy: 'dimas@example.com', NextMilestone: 'Site visit', NextMilestoneDate: d(-27) }),
    log('P-2026-004', -27, 9, 'Site visit', '1st site visit', 'Soil looks firm; access road needs widening for the crane. Existing substation fence to be relocated 6 m.', { SubmittedBy: 'dimas@example.com', Issues: 'Crane access during rainy season.', Attachments: `Site photos.zip | ${FILE('site-photos')}` }),
    log('P-2026-004', -18, 15, 'Quotation', '1st quotation sent', 'Submitted quotation Rp 6.85 B, 210 calendar days, 30% down payment.', { SubmittedBy: 'dimas@example.com', Attachments: `Quotation Rev0.pdf | ${FILE('quote-r0')}\nBOQ Rev0.xlsx | ${FILE('boq-r0')}` }),
    log('P-2026-004', -6, 14, 'Meeting', '2nd meeting – price negotiation', 'Client asked for 7% off and a 10% down payment. We offered 3% off if the down payment stays at 20%. Client to confirm budget approval internally.', { SubmittedBy: 'dimas@example.com', Issues: 'Margin falls below 12% if we give more than 4%.', NextMilestone: 'Revised quotation due', NextMilestoneDate: d(4), Attachments: `MoM meeting 2.pdf | ${FILE('mom-2')}` }),
    log('P-2026-004', -1, 11, 'Negotiation', 'Negotiation call – payment terms', 'Client open to 20% down payment if delivery shortens to 190 days. Checking the steel supplier lead time before answering.', { SubmittedBy: 'dimas@example.com' }),
    // Active projects.
    log('P-2025-004', -2, 16, 'Update', 'Week 37 progress', 'Rack modules 1–4 erected and bolted; modules 5–6 in blasting/painting. Hydrotest procedure approved by the client.', { PhysicalProgressPct: 72, NextMilestone: 'Hydrotest of rack modules 5–8', NextMilestoneDate: d(9) }),
    log('P-2025-004', -16, 10, 'Issue', 'Steel delivery delay', 'Second steel batch (86 t) delayed two weeks at the mill. Re-sequenced painting to keep the crew busy.', { PhysicalProgressPct: 64, Issues: 'Possible 1-week slip on module 7 if the mill slips again.' }),
    log('P-2025-004', -45, 9, 'Milestone', 'Modules 1–4 erected', 'First four modules erected and accepted by the client QC.', { PhysicalProgressPct: 55, Attachments: `Inspection report M1-4.pdf | ${FILE('ir-m14')}` }),
    log('P-2026-001', -19, 13, 'Meeting', 'Progress meeting with port authority', 'Fender delivery confirmed for the end of the month. Bollard bases need a new anchor design.', { PhysicalProgressPct: 35, SubmittedBy: 'agus@example.com', Issues: 'Anchor redesign not yet approved.' }),
    log('P-2026-001', -48, 8, 'Mobilization', 'Mobilization complete', 'Crew of 14 and a 50 t crane barge on site.', { PhysicalProgressPct: 10, SubmittedBy: 'agus@example.com' }),
    log('P-2026-002', -4, 15, 'Update', 'Tie-ins 80% complete', 'Piping tie-ins 80% complete; hydrotest scheduled next week. Two valves still at the supplier.', { PhysicalProgressPct: 58, Issues: 'Valves V-201/V-205 delayed.', NextMilestone: 'Mechanical completion', NextMilestoneDate: d(16) }),
    log('P-2026-002', -30, 10, 'Milestone', 'Civil works handed over', 'Foundations and shelter handed over to the mechanical team.', { PhysicalProgressPct: 40 }),
    log('P-2026-003', -27, 9, 'Issue', 'Work suspended by client', 'Permit-to-work suspended pending the client’s HSE audit. Crew demobilized except one supervisor.', { PhysicalProgressPct: 20, SubmittedBy: 'agus@example.com', Issues: 'Standby costs are not covered by the contract.' }),
    log('P-2025-002', -325, 14, 'Handover', 'BAST signed – turnaround complete', 'All scaffolding dismantled; insulation punch list closed. BAST signed by the client’s turnaround manager.', { PhysicalProgressPct: 100, SubmittedBy: 'agus@example.com' }),
    log('P-2024-007', -290, 10, 'Handover', 'BAST signed', 'Final handover (BAST) signed; 5% retention released after 6 months.', { PhysicalProgressPct: 100, SubmittedBy: 'dimas@example.com' }),
  ];

  // --- tenders and certificates --------------------------------------------------------
  const tenders = [
    { TenderID: 'T-2026-021', Title: 'EPC – Compressor Package Relocation', Buyer: 'PT Ilustrasi Energi', PortalOrSource: 'Client e-procurement', ReferenceNo: 'RFQ-2026-118', QnADeadline: d(2), SubmissionDeadline: d(12), Status: 'Go', OwnerEmail: 'dimas@example.com', ScreeningSummary: 'Fits our mechanical experience; needs a crane partner.', LinkedProjectCode: '' },
    { TenderID: 'T-2026-022', Title: 'Pipeline Cathodic Protection Survey', Buyer: 'PT Sampel Migas', PortalOrSource: 'Email invitation', ReferenceNo: 'ITB-2026-044', SubmissionDeadline: d(6), Status: 'Submitted', OwnerEmail: 'rina@example.com', LinkedProjectCode: '' },
    { TenderID: 'T-2026-023', Title: 'Water Treatment Plant Expansion – Civil Works', Buyer: 'PDAM Contoh', PortalOrSource: 'LPSE', ReferenceNo: '1234567', AanwijzingDate: d(9), SubmissionDeadline: d(23), Status: 'Screening', ScreeningSummary: 'Needs SBU sub-classification BS001 — valid.' },
    { TenderID: 'T-2026-024', Title: 'Supply of Phenolic Plywood and Formwork Timber', Buyer: 'PT Contoh Kilang Nusantara', PortalOrSource: 'Vendor portal', ReferenceNo: 'PR-2026-0311', SubmissionDeadline: d(3), Status: 'Go', OwnerEmail: 'agus@example.com' },
    { TenderID: 'T-2026-019', Title: 'Jetty Fender Replacement – Phase 2', Buyer: 'PT Sampel Pelabuhan Indonesia', PortalOrSource: 'Direct', ReferenceNo: 'RFQ-PH2-07', SubmissionDeadline: d(-20), Status: 'Won', LinkedProjectCode: 'P-2026-001' },
    { TenderID: 'T-2026-017', Title: 'Fire Water Pump House', Buyer: 'PT Contoh Petrokimia', ReferenceNo: 'RFQ-0099', SubmissionDeadline: d(-41), Status: 'Lost' },
    { TenderID: 'T-2026-016', Title: 'Office Fit-out, Level 3', Buyer: 'PT Ilustrasi Properti', ReferenceNo: 'INV-77', SubmissionDeadline: d(-35), Status: 'No-Go', ScreeningSummary: 'Out of core scope.' },
  ];
  const evidence = [
    { Type: 'SBU', NameOrNumber: 'SBU Konstruksi BS001 – Bangunan Industri', Issuer: 'LPJK', Scope: 'Industrial buildings', ValidFrom: d(-700), ValidUntil: d(-5), DocumentURL: DOC, OwnerEmail: 'rina@example.com' },
    { Type: 'ISO', NameOrNumber: 'ISO 45001:2018', Issuer: 'Contoh Certification', Scope: 'EPC and supply services', ValidFrom: d(-1000), ValidUntil: d(24), DocumentURL: DOC },
    { Type: 'SMK3', NameOrNumber: 'SMK3 Tingkat Lanjutan', Issuer: 'Kemnaker', ValidFrom: d(-300), ValidUntil: d(51), DocumentURL: DOC },
    { Type: 'ISO', NameOrNumber: 'ISO 9001:2015', Issuer: 'Contoh Certification', Scope: 'EPC and supply services', ValidFrom: d(-400), ValidUntil: d(420), DocumentURL: DOC },
    { Type: 'NIB', NameOrNumber: 'NIB 9120000000001', Issuer: 'OSS', ValidFrom: d(-900), ValidUntil: '', DocumentURL: DOC },
    { Type: 'CSMS', NameOrNumber: 'CSMS – PT Contoh Kilang Nusantara', Issuer: 'PT Contoh Kilang Nusantara', ValidFrom: d(-200), ValidUntil: d(165), DocumentURL: DOC },
    { Type: 'Vendor Registration', NameOrNumber: 'Vendor No. 30001234', Issuer: 'PT Sampel Migas', ValidFrom: d(-150), ValidUntil: d(580) },
  ].map((e) => ({ ...e, Status: '' }));

  // --- finance: contract values, invoices, contracts, taxes --------------------------------
  const contractValue: Record<string, number> = {
    'P-2025-002': 7_400_000_000, 'P-2025-004': 9_850_000_000, 'P-2026-001': 4_200_000_000, 'P-2026-002': 6_300_000_000, 'P-2026-003': 2_750_000_000, 'P-2024-007': 3_150_000_000,
  };
  const projectFinance = Object.entries(contractValue).map(([ProjectCode, ContractValue]) => ({ ProjectCode, ContractValue, Currency: 'IDR' }));

  const rand = rng(42);
  const invoices: Record<string, Cell>[] = [];
  let n = 1;
  // Progress claims roughly every month over the last ~20 months, newest unpaid, a few late.
  const plan: [string, number, number, number][] = [
    // project, first day (offset), last day, claims
    ['P-2024-007', -560, -300, 6],
    ['P-2025-002', -470, -320, 6],
    ['P-2025-004', -250, -5, 8],
    ['P-2026-002', -140, -12, 5],
    ['P-2026-001', -110, -25, 3],
    ['P-2026-003', -90, -60, 1],
  ];
  for (const [code, from, to, claims] of plan) {
    const done = code === 'P-2024-007' || code === 'P-2025-002';
    const share = contractValue[code] * (done ? 1 : 0.55) / claims;
    for (let i = 0; i < claims; i++) {
      const day = Math.round(from + ((to - from) * i) / Math.max(1, claims - 1));
      const amount = Math.round((share * (0.85 + rand() * 0.3)) / 1_000_000) * 1_000_000;
      const due = day + 30;
      const age = -day;
      let paidDay: number | '' = '';
      if (age > 75) paidDay = due + Math.round(rand() * 20) - 5; // older claims paid, some a little late
      else if (age > 45 && rand() > 0.5) paidDay = due + Math.round(rand() * 10);
      if (code === 'P-2026-003' || (code === 'P-2026-001' && i === 1)) paidDay = ''; // two clearly overdue
      if (typeof paidDay === 'number' && paidDay > 0) paidDay = '';
      const no = `INV/${iso(d(day)).slice(0, 4)}/${String(n++).padStart(3, '0')}`;
      invoices.push({
        InvoiceNo: no, ProjectCode: code, InvoiceDate: d(day), Amount: amount, Currency: 'IDR', DueDate: d(due),
        PaidDate: paidDay === '' ? '' : d(paidDay), PaidAmount: paidDay === '' ? '' : amount,
      });
    }
  }

  const contracts = [
    { ContractNo: 'PO-2022-031', Title: 'Supply of phenolic-film plywood and formwork timber', Client: 'PT Contoh Kilang Nusantara', ContractValue: 1_240_000_000, ContractDate: d(-1420), DocumentType: 'Purchase Order', Notes: 'Scope: Supply of 2,000 sheets of 12 mm phenolic plywood and 150 m3 meranti timber to site.\nLocation: Balikpapan\nPeriod: 14 days' },
    { ContractNo: 'PO-2022-058', Title: 'Rental of 25 kVA generator sets with accessories', Client: 'PT Contoh Kilang Nusantara', ContractValue: 186_000_000, ContractDate: d(-1300), DocumentType: 'Rental Agreement', Notes: 'Scope: Rental of three 25 kVA generator sets, 6 months.\nLocation: Balikpapan' },
    { ContractNo: 'SC-2023-007', Title: 'Subcontract – drainage sand and gravel works', Client: 'PT Ilustrasi Karya', ContractValue: 2_960_000_000, ContractDate: d(-1080), CompletionDate: d(-900), DocumentType: 'Subcontract + BAST', Notes: 'Scope: Supply and placement of drainage sand, 18,000 m3.\nLocation: Kalimantan Timur' },
    { ContractNo: 'PO-2023-114', Title: 'Supply of construction tools and consumables', Client: 'PT Sampel Migas', ContractValue: 640_000_000, ContractDate: d(-960), DocumentType: 'Purchase Order', Notes: 'Scope: Sockets, cutting wheels, barricade tape and hand tools for a pipeline spread.' },
    { ContractNo: 'PO-2024-077', Title: 'Toll road embankment – common borrow and excavation', Client: 'PT Contoh Infrastruktur', ProjectCode: 'P-2024-007', ContractValue: 3_150_000_000, ContractDate: d(-525), CompletionDate: d(-290), DocumentType: 'Purchase Order + BAST', Notes: 'Scope: Common borrow embankment 22,500 m3 and ordinary excavation 12,200 m3.\nLocation: Jambi' },
    { ContractNo: 'UR-2025-004', Title: 'Refinery turnaround support – scaffolding and insulation', Client: 'PT Contoh Kilang Nusantara', ProjectCode: 'P-2025-002', ContractValue: 7_400_000_000, ContractDate: d(-485), CompletionDate: d(-325), DocumentType: 'Unit-rate contract + BAST', Notes: 'Scope: Scaffolding erection/dismantling and hot insulation during a 45-day turnaround.\nLocation: Balikpapan' },
    { ContractNo: 'LS-2025-002', Title: 'Pipe rack fabrication and erection – Refinery Unit 2', Client: 'PT Contoh Kilang Nusantara', ProjectCode: 'P-2025-004', ContractValue: 9_850_000_000, ContractDate: d(-265), DocumentType: 'Lump-sum contract', Notes: 'Scope: Fabrication, painting and erection of 8 pipe-rack modules, 640 t.' },
    { ContractNo: 'PO-2026-015', Title: 'Gas metering station upgrade – mechanical package', Client: 'PT Ilustrasi Energi', ProjectCode: 'P-2026-002', ContractValue: 6_300_000_000, ContractDate: d(-155), DocumentType: 'Purchase Order' },
    { ContractNo: 'PO-2026-022', Title: 'Jetty fender and bollard replacement', Client: 'PT Sampel Pelabuhan Indonesia', ProjectCode: 'P-2026-001', ContractValue: 4_200_000_000, ContractDate: d(-125), DocumentType: 'Purchase Order' },
    { ContractNo: 'PO-2026-031', Title: 'Tank farm fire protection retrofit', Client: 'PT Contoh Petrokimia', ProjectCode: 'P-2026-003', ContractValue: 2_750_000_000, ContractDate: d(-100), DocumentType: 'Purchase Order' },
  ].map((c) => ({ Currency: 'IDR', DocumentURL: DOC, ...c }));

  // Taxes: the last three months and this month, in every state.
  const p = Logic.jakartaCalendarParts(now) as { year: number; month: number };
  const period = (back: number) => {
    const m = p.month - back;
    const y = p.year + Math.floor((m - 1) / 12);
    return `${y}-${String(((m - 1) % 12 + 12) % 12 + 1).padStart(2, '0')}`;
  };
  const taxes: Record<string, Cell>[] = [];
  const amounts: Record<string, number> = { PPN: 312_000_000, 'PPh 4(2)': 38_500_000, 'PPh 21': 14_200_000, 'PPh 23': 3_150_000, 'PPh 25': 11_000_000 };
  for (const back of [3, 2, 1, 0]) {
    for (const type of Logic.TAX_MONTHLY_TYPES as string[]) {
      const per = period(back);
      const due = Logic.taxDueDates(type, per) as { payDue: string; reportDue: string };
      const rec: Record<string, Cell> = {
        TaxID: Logic.taxId(type, per), TaxType: type, Period: per, Amount: back > 0 ? Math.round(amounts[type] * (0.8 + rand() * 0.4) / 1000) * 1000 : '',
        PayDueDate: Logic.isoToSheetSerial(due.payDue), ReportDueDate: Logic.isoToSheetSerial(due.reportDue),
      };
      const paid = (offsetFromDue: number) => {
        rec.PaidDate = Math.min(today, Logic.isoToSheetSerial(due.payDue) + offsetFromDue);
        rec.BillingCode = `0${Math.floor(rand() * 1e14)}`.slice(0, 15);
        rec.NTPN = Math.floor(rand() * 36 ** 8).toString(36).toUpperCase().padStart(8, '0') + 'DEMO1234';
      };
      if (back >= 2) {
        if (type === 'PPh 4(2)') rec.Status = 'Withheld by client';
        else if (back === 2 && type === 'PPh 25') { /* left unpaid: overdue */ }
        else { paid(-3); rec.ReportedDate = Math.min(today, Logic.isoToSheetSerial(due.reportDue) - 2); }
      } else if (back === 1) {
        if (type === 'PPh 21') paid(-4);
        if (type === 'PPh 4(2)') rec.Status = 'Withheld by client';
      }
      taxes.push(rec);
    }
  }
  if (p.month <= 4) {
    const due = Logic.taxDueDates('SPT Tahunan Badan', String(p.year - 1)) as { payDue: string; reportDue: string };
    taxes.push({ TaxID: Logic.taxId('SPT Tahunan Badan', String(p.year - 1)), TaxType: 'SPT Tahunan Badan', Period: String(p.year - 1), PayDueDate: Logic.isoToSheetSerial(due.payDue), ReportDueDate: Logic.isoToSheetSerial(due.reportDue) });
  }

  return {
    Projects: sheet('Projects', projects),
    ProjectLog: sheet('ProjectLog', logs),
    Tenders: sheet('Tenders', tenders),
    Evidence: sheet('Evidence', evidence),
    Config: [['Key', 'Value'], ['StaleUpdateDays', '14']],
    ProjectFinance: sheet('ProjectFinance', projectFinance),
    Invoices: sheet('Invoices', invoices),
    Contracts: sheet('Contracts', contracts),
    Taxes: sheet('Taxes', taxes),
  };
}
