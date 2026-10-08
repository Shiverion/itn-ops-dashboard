// Fictional email threads for the demo's project and tender pages, dated relative to
// today. In the real dashboard these come from the daily knowledge job, which
// matches the shared mailbox's threads to projects and tenders and keeps only a short
// summary of each. There is no mailbox here, so the threads have no Gmail link.
import type { ProjectEmail } from '../types';

function at(offsetDays: number, hour: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

type Seed = [id: string, first: number, last: number, messages: number, kind: string, subject: string, counterparty: string, summary: string, documents?: string[]];

const SEED: Record<string, Seed[]> = {
  'P-2026-004': [
    ['e401', -2, -1, 3, 'Negotiation', 'RE: Substation control building – payment terms', 'PT Sampel Daya Listrik', 'The client can accept a 20% down payment if delivery is shortened to 190 days and asked for confirmation this week. ITN is checking the steel supplier’s lead time before answering.'],
    ['e402', -7, -6, 2, 'Meeting', 'MoM 2nd meeting – price negotiation', 'PT Sampel Daya Listrik', 'ITN sent the minutes of the second meeting: the client asked for 7% off and a 10% down payment; ITN offered 3% off with a 20% down payment. The client is checking its budget approval.', ['MoM meeting 2.pdf']],
    ['e403', -19, -17, 4, 'Quotation', 'Quotation – Substation Control Building, Samarinda', 'PT Sampel Daya Listrik', 'ITN submitted quotation Rev0 at Rp 6.85 B for 210 calendar days with a 30% down payment. The client confirmed receipt and asked for the BOQ in Excel, which was sent.', ['Quotation Rev0.pdf', 'BOQ Rev0.xlsx']],
    ['e404', -36, -33, 3, 'RFQ', 'Request for quotation – control building and cable trench', 'PT Sampel Daya Listrik', 'The client invited ITN to quote a two-storey control building with cable trench and grounding, and proposed an introduction meeting and a site visit.', ['RFQ scope of work.pdf']],
  ],
  'P-2025-004': [
    ['e501', -3, -2, 2, 'Technical', 'Hydrotest procedure HT-PR-004 for approval', 'PT Contoh Kilang Nusantara', 'ITN sent the hydrotest procedure for rack modules 5–8; the client approved it with one comment on the pressure hold time.', ['HT-PR-004 Rev1.pdf']],
    ['e502', -18, -15, 5, 'Other', 'Second steel batch – revised delivery', 'PT Contoh Baja Mandiri', 'The mill moved the second steel batch (86 t) back by two weeks. ITN asked for a firm date and a weekly status; the mill confirmed a new date but no penalty for the slip.'],
    ['e503', -40, -38, 2, 'Invoice / Payment', 'Progress claim 4 – supporting documents', 'PT Contoh Kilang Nusantara', 'The client asked for the signed inspection report for modules 1–4 before processing progress claim 4; ITN sent it the next day.', ['Inspection report M1-4.pdf']],
  ],
  'P-2026-001': [
    ['e101', -12, -9, 4, 'Technical', 'Bollard base anchor redesign', 'PT Sampel Pelabuhan Indonesia', 'The port authority rejected the original anchor detail for the bollard bases. ITN sent a redesign with longer anchors; approval is still pending.', ['Bollard anchor detail Rev2.pdf']],
    ['e102', -21, -20, 2, 'Site', 'Cone fender delivery schedule', 'PT Contoh Marine Supply', 'The supplier confirmed that the 24 cone fenders ship at the end of the month by barge from Surabaya.'],
  ],
  'P-2026-002': [
    ['e201', -6, -4, 3, 'Other', 'Valves V-201 / V-205 delivery', 'PT Ilustrasi Valve', 'The supplier delayed two valves by ten days. ITN asked whether a partial delivery is possible so the hydrotest can start on the other lines.'],
  ],
  'P-2026-003': [
    ['e301', -28, -25, 3, 'Site', 'Suspension of permit-to-work pending HSE audit', 'PT Contoh Petrokimia', 'The client suspended work pending its HSE audit. ITN asked who covers the standby costs and for an audit date; neither has been answered yet.'],
  ],
};

const TENDER_SEED: Record<string, Seed[]> = {
  'T-2026-021': [
    ['t211', -4, -3, 3, 'Technical', 'RFQ-2026-118 – clarification on foundation scope', 'PT Ilustrasi Energi', 'ITN asked whether the compressor foundations are in scope; the buyer confirmed they are excluded and kept the Q&A deadline. ITN is still looking for a crane partner.'],
    ['t212', -15, -15, 1, 'RFQ', 'Invitation – EPC compressor package relocation (RFQ-2026-118)', 'PT Ilustrasi Energi', 'The buyer invited ITN to quote the relocation of a compressor package and sent the RFQ documents and schedule.', ['RFQ-2026-118.pdf', 'Scope of Work.pdf']],
  ],
  'T-2026-022': [
    ['t221', -8, -7, 2, 'Quotation', 'ITB-2026-044 – bid submission', 'PT Sampel Migas', 'ITN submitted its technical and commercial bid for the cathodic protection survey; the buyer confirmed receipt and will announce the evaluation result after the deadline.', ['Technical proposal.pdf', 'Commercial proposal.pdf']],
  ],
  'T-2026-019': [
    ['t191', -17, -14, 4, 'PO / Contract', 'Award – Jetty Fender Replacement Phase 2', 'PT Sampel Pelabuhan Indonesia', 'The port authority awarded phase 2 to ITN and sent the purchase order; ITN signed and returned it, and the work became project P-2026-001.', ['PO RFQ-PH2-07.pdf']],
  ],
};

function build(seed: Record<string, Seed[]>, ids: string[]): Record<string, ProjectEmail[]> {
  return Object.fromEntries(
    ids.map((code) => [
      code,
      (seed[code] ?? []).map(([id, first, last, messages, kind, subject, counterparty, summary, documents = []]) => ({
        id, link: null, subject, first: at(first, 2), last: at(last, 7), messages, summary, counterparty, kind, documents,
      })),
    ]),
  );
}

export const demoProjectEmails = (codes: string[]) => build(SEED, codes);
export const demoTenderEmails = (ids: string[]) => build(TENDER_SEED, ids);
