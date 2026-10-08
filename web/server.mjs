// ITN Ops dashboard at ops.itnconstruction.com (Cloud Run service itn-dashboard).
//
// Same page as the Apps Script dashboard, on ITN's own domain, plus editing:
// - The viewer signs in with Google (Google Identity Services). Every API call
//   carries that ID token; it must be for this app's OAuth client and a verified
//   @itnconstruction.com account.
// - The sheets are read and edited AS THE VIEWER (domain-wide delegation, Sheets
//   scopes only), so Google's own sharing still decides who sees and changes what:
//   the Finance sections appear only for people who can open the Finance sheet, and
//   an edit fails for anyone without edit access. This code never elevates, except
//   to append to the owner-only AuditLog tabs as ITN_AUDIT_ACTOR.
// - The payload is built by buildDashboardPayload and every edit is planned by
//   planEdit (allowed fields, validation, duplicate checks) in shared/Logic.js,
//   before anything is written.
// - The Refresh button is forwarded to the itn-refresh service with the viewer's
//   ID token, which does its own checks and cooldown.
// - Uploaded files go to the "ITN Ops Files" shared drive (drive.mjs), as the
//   service account itself, which is a member of that shared drive only.
// - The AI (ai.mjs) drafts log entries/certificates from uploaded files and
//   answers questions, from data the viewer can already see.
// - Email per project/tender: the knowledge job matches mailbox threads to projects
//   and tenders and stores a short summary of each (state/project-email.json, no
//   email text); the dashboard shows them on the project and tender pages and
//   gives them to the advisor.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import * as AI from './ai.mjs';
import { createDrive, driveFileId, MAX_UPLOAD_BYTES, UPLOAD_TYPES } from './drive.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Logic = require(process.env.ITN_LOGIC_PATH || path.join(here, '..', 'shared', 'Logic.js'));
const Config = require(process.env.ITN_CONFIG_PATH || path.join(here, '..', 'dashboard', 'src', 'Config.js'));

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') throw new Error(`${name} is not set`);
  return value;
};
const CLIENT_ID = env('ITN_OAUTH_CLIENT_ID');
const DOMAIN = env('ITN_DOMAIN', 'itnconstruction.com');
const OPS_ID = env('ITN_OPS_SPREADSHEET_ID');
const FINANCE_ID = process.env.ITN_FINANCE_SPREADSHEET_ID || '';
const DELEGATING_SA = env('ITN_DELEGATING_SERVICE_ACCOUNT'); // signs the delegation JWTs; DWD scopes: spreadsheets(.readonly)
const REFRESH_URL = env('ITN_REFRESH_URL');
const AUDIT_ACTOR = process.env.ITN_AUDIT_ACTOR || ''; // owner of the spreadsheets (the only editor of the AuditLog tabs)
const PORT = Number(process.env.PORT || 8080);
const SHEETS_READ = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const SHEETS_WRITE = 'https://www.googleapis.com/auth/spreadsheets';
const MAX_BODY = 64 * 1024;
const FILES_DRIVE_ID = process.env.ITN_FILES_DRIVE_ID || ''; // the "ITN Ops Files" shared drive
const STATE_BUCKET = process.env.ITN_STATE_BUCKET || ''; // knowledge notes (state/notes-src, state/finance-src)
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- page -------------------------------------------------------------------------

const html = readFileSync(process.env.ITN_INDEX_PATH || path.join(here, 'public', 'index.html'), 'utf8');
// The build inlines the app's script; allow exactly that script (by hash) plus Google sign-in.
const scriptHashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .filter((m) => m[1].trim())
  .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
const GSI = 'https://accounts.google.com/gsi/';
const CSP = [
  "default-src 'none'",
  `script-src ${scriptHashes.join(' ')} ${GSI}client`,
  `style-src 'unsafe-inline' ${GSI}style`,
  `connect-src 'self' ${GSI}`,
  `frame-src ${GSI}`,
  "img-src 'self' data:",
  "font-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': CSP,
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', // Google sign-in popup
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-cache',
};
const COMMON_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
};

// --- identity ---------------------------------------------------------------------

const oauth = new OAuth2Client();

/** The signed-in viewer from the request's Google ID token; throws 401/403. */
export async function viewerFrom(req, verify = (idToken) => oauth.verifyIdToken({ idToken, audience: CLIENT_ID })) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in.');
  const idToken = header.slice(7);
  let claims;
  try {
    claims = (await verify(idToken)).getPayload();
  } catch {
    throw new HttpError(401, 'Your sign-in has expired. Please sign in again.');
  }
  const email = String(claims.email || '').toLowerCase();
  if (!claims.email_verified || claims.hd !== DOMAIN || !email.endsWith('@' + DOMAIN)) {
    throw new HttpError(403, `Only ${DOMAIN} Google accounts can open this dashboard.`);
  }
  return { email, idToken };
}

// --- sheets, as the viewer ----------------------------------------------------------

const adc = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const viewerTokens = new Map(); // "email scope" -> { token, expires }

/**
 * An access token from a JWT signed by the service account (keyless: IAM signJwt):
 * as `email` through domain-wide delegation, or, with email null, as the service
 * account itself (used for the shared drive it is a member of).
 */
async function sheetsTokenFor(email, scope = SHEETS_READ) {
  const key = `${email} ${scope}`;
  const cached = viewerTokens.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: DELEGATING_SA, ...(email ? { sub: email } : {}), scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const signed = await fetch(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${DELEGATING_SA}:signJwt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await adc.getAccessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: JSON.stringify(claims) }),
  });
  if (!signed.ok) throw new Error(`signJwt failed: ${signed.status}`);
  const exchanged = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: (await signed.json()).signedJwt }),
  });
  if (!exchanged.ok) throw new Error(`delegated token for the viewer failed: ${exchanged.status} ${(await exchanged.text()).slice(0, 200)}`);
  const body = await exchanged.json();
  viewerTokens.set(key, { token: body.access_token, expires: Date.now() + body.expires_in * 1000 });
  return body.access_token;
}

const quoteSheet = (name) => `'${name.replace(/'/g, "''")}'`;

async function sheetsApi(token, url, init = {}) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${url}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!res.ok) {
    const error = new Error(`Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

/** { sheetName: values } in one Sheets API call (same render options as the Apps Script dashboard). */
async function readSheets(token, spreadsheetId, sheetNames) {
  if (!sheetNames.length) return {};
  const qs = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER', majorDimension: 'ROWS' });
  for (const name of sheetNames) qs.append('ranges', quoteSheet(name));
  const body = await sheetsApi(token, `${encodeURIComponent(spreadsheetId)}/values:batchGet?${qs}`);
  const out = {};
  (body.valueRanges || []).forEach((vr, i) => {
    out[sheetNames[i]] = vr.values || [];
  });
  return out;
}

/** Tab names in a spreadsheet (so a tab that doesn't exist yet is skipped, not an error). */
async function sheetTitles(token, spreadsheetId) {
  const body = await sheetsApi(token, `${encodeURIComponent(spreadsheetId)}?fields=sheets.properties.title`);
  return (body.sheets || []).map((sh) => sh.properties.title);
}

const OPTIONS = {
  projectStatuses: Config.PROJECT_STATUSES,
  logTypes: Config.LOG_TYPES,
  evidenceTypes: Config.EVIDENCE_TYPES,
  tenderStatuses: Config.TENDER_STATUSES,
  currencies: Config.CURRENCY_OPTIONS,
  taxTypes: Config.TAX_TYPES,
  taxStatuses: Config.TAX_STATUSES,
};
const SCHEMA = {
  columns: Config.COLUMNS,
  dateColumns: Config.DATE_COLUMNS,
  dateTimeColumns: Config.DATE_TIME_COLUMNS,
  defaultStaleDays: Config.DEFAULT_STALE_UPDATE_DAYS,
};

const sheetLink = (id) => (id ? Logic.resolveUrl(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`) : null);
const jakartaStamp = (now) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: Config.TIME_ZONE, dateStyle: 'short', timeStyle: 'medium' }).format(now); // "2026-10-03 10:15:00"
const formatGenerated = (now) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: Config.TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .format(now)
    .replace(' at ', ', ');

async function dashboardData(viewer) {
  const token = await sheetsTokenFor(viewer.email);
  let ops;
  try {
    ops = await readSheets(token, OPS_ID, [Config.SHEET_PROJECTS, Config.SHEET_PROJECT_LOG, Config.SHEET_TENDERS, Config.SHEET_EVIDENCE, Config.SHEET_CONFIG]);
  } catch (e) {
    if (e.status === 403 || e.status === 404) {
      throw new HttpError(403, 'Your Google account can’t open the Operations sheet. Ask the ITN Ops admin to share it with you.');
    }
    throw e;
  }
  let finance = null;
  let financeExtra = {};
  if (FINANCE_ID) {
    try {
      const titles = await sheetTitles(token, FINANCE_ID);
      const wanted = [Config.SHEET_PROJECT_FINANCE, Config.SHEET_INVOICES, Config.SHEET_CONTRACTS, Config.SHEET_TAXES].filter((t) => titles.includes(t));
      const sheets = await readSheets(token, FINANCE_ID, wanted);
      finance = sheets[Config.SHEET_PROJECT_FINANCE] || null;
      financeExtra = { Invoices: sheets[Config.SHEET_INVOICES], Contracts: sheets[Config.SHEET_CONTRACTS], Taxes: sheets[Config.SHEET_TAXES] };
    } catch {
      finance = null; // the viewer can't open the Finance sheet: those sections stay hidden
    }
  }
  const now = new Date();
  const payload = Logic.buildDashboardPayload({
    ops,
    finance,
    financeExtra,
    schema: SCHEMA,
    options: OPTIONS,
    now,
    generatedAt: formatGenerated(now),
    viewerEmail: viewer.email,
    opsSheet: sheetLink(OPS_ID),
    financeSheet: sheetLink(FINANCE_ID),
  });
  const emails = await loadProjectEmails().catch((e) => {
    console.error('project emails', e.message);
    return null;
  });
  payload.projectEmails = emailsFor(emails, 'projects', payload.projects.map((p) => p.projectCode));
  payload.tenderEmails = emailsFor(emails, 'tenders', payload.tenders.map((t) => t.tenderId));
  return payload;
}

let emailCache = { at: 0, value: null };

/** The knowledge job's email-per-project file (state/project-email.json), cached for 10 minutes. */
async function loadProjectEmails() {
  if (!STATE_BUCKET) return null;
  if (emailCache.value && Date.now() - emailCache.at < 10 * 60 * 1000) return emailCache.value;
  const token = await adc.getAccessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STATE_BUCKET)}/o/${encodeURIComponent('state/project-email.json')}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 404) return null; // not built yet
  if (!res.ok) throw new Error(`project-email.json: ${res.status}`);
  emailCache = { at: Date.now(), value: await res.json() };
  return emailCache.value;
}

const GMAIL_LINK = /^https:\/\/mail\.google\.com\/mail\/u\/0\/#all\/[0-9a-f]+$/;

/** { id: threads newest first } for the given project codes or tender IDs (field 'projects' or 'tenders'); only the fields the pages show. */
export function emailsFor(store, field, ids) {
  const out = Object.fromEntries(ids.filter(Boolean).map((c) => [c, []]));
  for (const t of Object.values(store?.threads || {})) {
    const thread = {
      id: String(t.id || ''),
      link: GMAIL_LINK.test(t.link) ? t.link : null,
      subject: String(t.subject || ''),
      first: String(t.first || ''),
      last: String(t.last || ''),
      messages: Number(t.messages) || 0,
      summary: String(t.summary || ''),
      counterparty: String(t.counterparty || ''),
      kind: String(t.kind || 'Other'),
      documents: (Array.isArray(t.documents) ? t.documents : []).map(String),
    };
    for (const id of Array.isArray(t[field]) ? t[field] : []) if (out[id]) out[id].push(thread);
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.last.localeCompare(a.last));
  return out;
}

// --- edits ---------------------------------------------------------------------------

const BOOKS = { ops: { id: () => OPS_ID, name: 'Operations' }, finance: { id: () => FINANCE_ID, name: 'Finance' } };

function colLetter(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Writes one row's cells: dates USER_ENTERED (stored as real dates), everything else RAW (never run as formulas). */
async function writeCells(token, spreadsheetId, sheet, row, cells, dateCells, columns) {
  const groups = { RAW: [], USER_ENTERED: [] };
  for (const [column, value] of Object.entries(cells)) {
    const range = `${quoteSheet(sheet)}!${colLetter(columns.indexOf(column) + 1)}${row}`;
    groups[dateCells.includes(column) ? 'USER_ENTERED' : 'RAW'].push({ range, values: [[value]] });
  }
  for (const [valueInputOption, data] of Object.entries(groups)) {
    if (!data.length) continue;
    await sheetsApi(token, `${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption, data }),
    });
  }
}

/** Appends one AuditLog row in the given spreadsheet, as the spreadsheets' owner (AuditLog is owner-only). */
async function audit(book, actor, action, details) {
  if (!AUDIT_ACTOR) return;
  try {
    const token = await sheetsTokenFor(AUDIT_ACTOR, SHEETS_WRITE);
    const row = [jakartaStamp(new Date()), Logic.sanitizeForSheet(actor), Logic.sanitizeForSheet(action), Logic.sanitizeForSheet(details.slice(0, 1500))];
    const range = encodeURIComponent(`${quoteSheet(Config.SHEET_AUDIT_LOG)}!A1:D1`);
    await sheetsApi(token, `${encodeURIComponent(BOOKS[book].id())}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: [row] }),
    });
  } catch (e) {
    console.error(`audit write failed (${book}): ${e.message}`);
  }
}

function describeChanges(plan) {
  return plan.changes
    .map(([column, before, after]) => (plan.created ? `${column}=${after}` : `${column}: ${before || '(blank)'} -> ${after || '(blank)'}`))
    .join('; ');
}

function writeError(e, book) {
  if (e instanceof HttpError) return e;
  if (e.status === 403) return new HttpError(403, `Your Google account can't edit the ${BOOKS[book].name} sheet. Ask the ITN Ops admin for edit access.`);
  if (e.status === 400 && /protected/i.test(e.message)) return new HttpError(403, `That part of the ${BOOKS[book].name} sheet is protected.`);
  if (e.status === 404 || /Unable to parse range/i.test(e.message)) {
    return new HttpError(404, `A tab in the ${BOOKS[book].name} sheet is missing. The admin needs to run setupItnOps once.`);
  }
  return e;
}

/** Project codes from the Operations sheet (to validate references), read as the viewer. */
async function projectCodes(token) {
  const values = (await readSheets(token, OPS_ID, [Config.SHEET_PROJECTS]))[Config.SHEET_PROJECTS];
  return values.slice(1).map((r) => String(r[0] || '').trim()).filter(Boolean);
}

/** One add/change to a register sheet, as the viewer. body: { kind, id?, fields }. */
async function applyEdit(viewer, body) {
  const kind = String(body.kind || '');
  const target = Logic.EDIT_TARGETS[kind];
  if (!target) throw new HttpError(400, 'Unknown kind of edit.');
  const spreadsheetId = BOOKS[target.book].id();
  if (!spreadsheetId) throw new HttpError(400, `The ${BOOKS[target.book].name} sheet isn't configured.`);
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  try {
    const token = await sheetsTokenFor(viewer.email, SHEETS_WRITE);
    const [values, codes] = await Promise.all([
      readSheets(token, spreadsheetId, [target.sheet]).then((r) => r[target.sheet]),
      projectCodes(token),
    ]);
    const plan = Logic.planEdit(kind, values, { id: body.id ? String(body.id) : null, fields }, {
      columns: Config.COLUMNS,
      dateColumns: Config.DATE_COLUMNS,
      lists: OPTIONS,
      projectCodes: codes,
      now: new Date(),
    });
    if (plan.errors) throw new HttpError(400, plan.errors.join('. ') + '.');
    if (!Object.keys(plan.cells).length) return { ok: true, id: plan.id, message: 'Nothing to change.' };
    await writeCells(token, spreadsheetId, plan.sheet, plan.row, plan.cells, plan.dateCells, Config.COLUMNS[plan.sheet]);
    await audit(target.book, viewer.email, `${plan.created ? 'Add' : 'Edit'} ${plan.sheet} (dashboard)`, `${plan.id}: ${describeChanges(plan)}`);
    return { ok: true, id: plan.id, created: plan.created, message: plan.created ? `Added ${plan.id}.` : `Saved ${plan.id}.` };
  } catch (e) {
    throw writeError(e, target.book);
  }
}

/**
 * Adds one entry to a project's activity log (a meeting, a negotiation round, a
 * site visit…) with optional attachments, and updates the project row: status,
 * progress and next milestone if given, and LastUpdateDate.
 * body: { projectCode, entry: { Type, Title, Summary, Issues, Date, Status,
 *         PhysicalProgressPct, NextMilestone, NextMilestoneDate }, attachments: [{ name, url }] }
 */
async function applyLog(viewer, body) {
  const code = String(body.projectCode || '').trim();
  const entry = body.entry && typeof body.entry === 'object' ? body.entry : {};
  const text = (k) => (entry[k] === undefined || entry[k] === null ? '' : String(entry[k]).trim());
  const attachments = (Array.isArray(body.attachments) ? body.attachments : []).map((a) => ({ name: String(a?.name || ''), url: String(a?.url || '') }));
  const errors = Logic.validateLogEntry({ ...entry, attachments }, OPTIONS);
  if (errors.length) throw new HttpError(400, errors.join('. ') + '.');

  const now = new Date();
  const fields = { LastUpdateDate: Logic.jakartaToday(now) };
  for (const k of ['Status', 'PhysicalProgressPct', 'NextMilestone', 'NextMilestoneDate']) if (text(k) !== '') fields[k] = text(k);
  const result = await applyEdit(viewer, { kind: 'project', id: code, fields });

  try {
    const token = await sheetsTokenFor(viewer.email, SHEETS_WRITE);
    const log = (await readSheets(token, OPS_ID, [Config.SHEET_PROJECT_LOG]))[Config.SHEET_PROJECT_LOG];
    const time = jakartaStamp(now).slice(11);
    const row = {
      Timestamp: text('Date') ? `${text('Date')} ${time}` : jakartaStamp(now),
      ProjectCode: code,
      Type: text('Type'),
      PhysicalProgressPct: text('PhysicalProgressPct') === '' ? '' : Number(text('PhysicalProgressPct')),
      Summary: text('Summary'),
      Issues: text('Issues'),
      NextMilestone: text('NextMilestone'),
      NextMilestoneDate: text('NextMilestoneDate'),
      SubmittedBy: viewer.email,
      Title: text('Title'),
      Attachments: Logic.formatAttachments(attachments),
    };
    const cells = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== ''));
    const dateCells = ['Timestamp', 'NextMilestoneDate'].filter((c) => c in cells);
    await writeCells(token, OPS_ID, Config.SHEET_PROJECT_LOG, Logic.lastUsedRowIndex(log) + 2, cells, dateCells, Config.COLUMNS.ProjectLog);
    await audit('ops', viewer.email, 'Add ProjectLog (dashboard)', `${code}: ${row.Type} - ${row.Title || row.Summary.slice(0, 80)}${attachments.length ? ` (${attachments.length} files)` : ''}`);
  } catch (e) {
    throw writeError(e, 'ops');
  }
  return { ...result, message: `Added to ${code}'s log.` };
}

// --- files ---------------------------------------------------------------------------

const drive = FILES_DRIVE_ID ? createDrive({ token: () => sheetsTokenFor(null, DRIVE_SCOPE), driveId: FILES_DRIVE_ID }) : null;

function needDrive() {
  if (!drive) throw new HttpError(503, 'File uploads are not set up yet (no shared drive configured).');
  return drive;
}

async function readRaw(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, `Files can be at most ${Math.round(limit / 1024 / 1024)} MB.`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** The project's name from the Operations sheet, read as the viewer (so only projects they can see). */
async function projectName(viewer, code) {
  const token = await sheetsTokenFor(viewer.email);
  const rows = (await readSheets(token, OPS_ID, [Config.SHEET_PROJECTS]))[Config.SHEET_PROJECTS].slice(1);
  const row = rows.find((r) => String(r[0] || '').trim() === code);
  if (!row) throw new HttpError(404, `Project ${code} was not found.`);
  return String(row[1] || '');
}

/** POST /api/upload?target=project&code=P-2026-001 | ?target=certificate&type=SBU, raw file body. */
async function handleUpload(req, viewer) {
  const d = needDrive();
  const url = new URL(req.url, 'http://x');
  const mimeType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!UPLOAD_TYPES[mimeType]) throw new HttpError(415, 'That kind of file can’t be uploaded. Use a photo, PDF, Word, Excel, PowerPoint, CSV or text file.');
  let name = 'Upload';
  try {
    name = decodeURIComponent(String(req.headers['x-file-name'] || 'Upload'));
  } catch {
    /* keep the default */
  }
  const target = url.searchParams.get('target');
  let parentId;
  let where;
  if (target === 'project') {
    const code = String(url.searchParams.get('code') || '');
    if (!Logic.isValidProjectCode(code)) throw new HttpError(400, 'Unknown project.');
    parentId = await d.projectFolder(code, await projectName(viewer, code));
    where = code;
  } else if (target === 'certificate') {
    const type = String(url.searchParams.get('type') || 'Other');
    if (!Config.EVIDENCE_TYPES.includes(type)) throw new HttpError(400, 'Unknown certificate type.');
    parentId = await d.certificateFolder(type);
    where = `Certificates/${type}`;
  } else {
    throw new HttpError(400, 'Say where the file belongs.');
  }
  const bytes = await readRaw(req, MAX_UPLOAD_BYTES);
  if (!bytes.length) throw new HttpError(400, 'The file is empty.');
  const file = await d.upload({ parentId, name, mimeType, bytes, properties: { uploadedBy: viewer.email.slice(0, 100) } });
  await audit('ops', viewer.email, 'Upload file (dashboard)', `${file.name} -> ${where}`);
  return { ok: true, file };
}

// --- AI ------------------------------------------------------------------------------

let notesCache = { at: 0, finance: null, text: null };

/** The Ask ITN knowledge notes from the knowledge job's state bucket (finance notes only for finance viewers). */
async function loadNotes(includeFinance) {
  if (!STATE_BUCKET) return '';
  if (notesCache.text !== null && notesCache.finance === includeFinance && Date.now() - notesCache.at < 10 * 60 * 1000) return notesCache.text;
  const token = await adc.getAccessToken();
  const base = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(STATE_BUCKET)}/o`;
  const parts = [];
  for (const prefix of ['state/notes-src/', ...(includeFinance ? ['state/finance-src/'] : [])]) {
    const list = await (await fetch(`${base}?prefix=${encodeURIComponent(prefix)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    for (const item of (list.items || []).filter((i) => i.name.endsWith('.md'))) {
      const res = await fetch(`${base}/${encodeURIComponent(item.name)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) parts.push(`# ${item.name.slice(prefix.length)}\n${await res.text()}`);
    }
  }
  notesCache = { at: Date.now(), finance: includeFinance, text: parts.join('\n\n') };
  return notesCache.text;
}

const compactLog = (log, n) =>
  log.slice(0, n).map((e) => ({ when: e.timestamp, kind: e.type, title: e.title, summary: e.summary, issues: e.issues, progress: e.physicalProgressPct, next: e.nextMilestone, nextDate: e.nextMilestoneDate, files: (e.attachments || []).map((a) => a.name) }));
const compactProject = (p, logEntries) => ({
  code: p.projectCode, name: p.name, client: p.client, location: p.location, status: p.status, pm: p.pmEmail,
  progressPct: p.physicalProgressPct, nextMilestone: p.nextMilestone, nextMilestoneDate: p.nextMilestoneDate,
  daysSinceUpdate: p.lastUpdateAgeDays, notes: p.raw?.Notes, start: p.raw?.StartDate, plannedEnd: p.raw?.PlannedEndDate,
  log: compactLog(p.log, logEntries),
});
const compactEmail = (e) => ({ last: e.last.slice(0, 10), first: e.first.slice(0, 10), subject: e.subject, with: e.counterparty, kind: e.kind, summary: e.summary, messages: e.messages, documents: e.documents });
const compactTender = (t) => ({ id: t.tenderId, title: t.title, buyer: t.buyer, status: t.status, next: t.nextStage, linkedProject: t.linkedProjectCode, screening: t.raw?.ScreeningSummary });
const strip = (list) => (list || []).map(({ raw, ...rest }) => rest);
// Contracts keep their Notes (the scope of work), which the AI needs to judge experience.
const stripContracts = (list) => (list || []).map(({ raw, documentUrlSafe, ...rest }) => ({ ...rest, notes: raw?.Notes || "" }));

/** The records an AI question sees: one project in depth, or everything in summary. */
function askData(data, code) {
  const finance = data.finance !== null;
  if (code) {
    const p = data.projects.find((x) => x.projectCode === code);
    if (!p) throw new HttpError(404, `Project ${code} was not found.`);
    return {
      project: compactProject(p, 60),
      emails: (data.projectEmails?.[code] || []).slice(0, 25).map(compactEmail),
      linkedTenderEmails: data.tenders.filter((t) => t.linkedProjectCode === code)
        .flatMap((t) => (data.tenderEmails?.[t.tenderId] || []).slice(0, 10).map((e) => ({ tender: t.tenderId, ...compactEmail(e) }))),
      linkedTenders: data.tenders.filter((t) => t.linkedProjectCode === code).map(compactTender),
      otherProjects: data.projects.filter((x) => x !== p).map((x) => ({ code: x.projectCode, name: x.name, status: x.status })),
      ...(finance && {
        finance: (data.finance || []).filter((f) => f.projectCode === code),
        invoices: strip((data.invoices || []).filter((i) => i.projectCode === code)),
        contracts: stripContracts((data.contracts || []).filter((c) => c.projectCode === code)),
      }),
    };
  }
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = (byId, label) =>
    Object.entries(byId || {}).flatMap(([id, list]) => list.filter((e) => e.last >= cutoff).map((e) => ({ [label]: id, ...compactEmail(e) })));
  const recentEmails = [...recent(data.projectEmails, 'project'), ...recent(data.tenderEmails, 'tender')]
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, 40);
  return {
    projects: data.projects.map((p) => compactProject(p, 10)),
    recentEmails,
    tenders: data.tenders.map(compactTender),
    certificates: data.evidence.map(({ raw, key, documentUrl, documentUrlSafe, ...c }) => c),
    ...(finance && { revenue: data.revenue, finance: data.finance, invoices: strip(data.invoices), contracts: stripContracts(data.contracts), taxes: strip(data.taxes) }),
  };
}

/** Files attached to a project's recent log entries (in the shared drive), newest first, within a size budget. */
async function recentAttachments(project, maxFiles = 4, maxBytes = 8 * 1024 * 1024) {
  if (!drive) return [];
  const files = [];
  let total = 0;
  for (const entry of project.log) {
    for (const a of entry.attachments || []) {
      if (files.length >= maxFiles) return files;
      const id = driveFileId(a.url);
      if (!id) continue;
      try {
        const f = await drive.download(id);
        if (total + f.bytes.length > maxBytes) continue;
        total += f.bytes.length;
        files.push(f);
      } catch {
        /* not in the shared drive or unreadable: skip */
      }
    }
  }
  return files;
}

/**
 * Answers stream back as NDJSON lines: {"delta": "..."} while the AI writes,
 * then {"done": true, "answer": "..."} (or {"error": "..."}).
 */
async function handleAsk(viewer, body, res) {
  const question = String(body.question || '').trim().slice(0, 2000);
  if (!question) throw new HttpError(400, 'Ask a question.');
  const code = body.projectCode ? String(body.projectCode) : null;
  const data = await dashboardData(viewer);
  const records = askData(data, code);
  const notes = await loadNotes(data.finance !== null).catch((e) => {
    console.error('notes', e.message);
    return '';
  });
  const files = code ? await recentAttachments(data.projects.find((p) => p.projectCode === code)) : [];
  const history = (Array.isArray(body.history) ? body.history : []).map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: String(m?.content || '') }));
  res.writeHead(200, { ...COMMON_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
  const line = (value) => res.write(JSON.stringify(value) + '\n');
  const started = Date.now();
  try {
    const answer = await AI.ask({
      question, history, scope: code ? `project ${code}` : 'the whole business', data: records, notes, files, today: Logic.jakartaToday(),
      onText: (delta) => line({ delta }),
    });
    line({ done: true, answer });
  } catch (e) {
    line({ error: e.message || 'The AI could not answer this time.' });
  }
  res.end();
  console.log(`ask by ${viewer.email} (${code || 'all'}): ${question.length} chars, ${files.length} files, ${Date.now() - started}ms`);
}

/** Deletes one row (a register row by its ID, or a log entry), as the viewer; the AuditLog keeps its full contents. */
async function applyDelete(viewer, body) {
  const kind = String(body.kind || '');
  const isLog = kind === 'log';
  const target = isLog ? { sheet: Config.SHEET_PROJECT_LOG, book: 'ops' } : Logic.EDIT_TARGETS[kind];
  if (!target) throw new HttpError(400, 'Unknown kind of record.');
  const spreadsheetId = BOOKS[target.book].id();
  try {
    const token = await sheetsTokenFor(viewer.email, SHEETS_WRITE);
    const values = (await readSheets(token, spreadsheetId, [target.sheet]))[target.sheet];
    const ctx = { columns: Config.COLUMNS, dateColumns: Config.DATE_COLUMNS };
    const plan = isLog
      ? Logic.planDeleteLogEntry(values, { row: body.row, projectCode: body.projectCode, timestamp: body.timestamp }, ctx)
      : Logic.planDelete(kind, values, body.id, ctx);
    if (plan.errors) throw new HttpError(400, plan.errors.join('. '));
    const meta = await sheetsApi(token, `${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`);
    const sheetId = meta.sheets.find((sh) => sh.properties.title === plan.sheet)?.properties.sheetId;
    if (sheetId === undefined) throw new HttpError(404, `The ${plan.sheet} tab was not found.`);
    await sheetsApi(token, `${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: plan.row - 1, endIndex: plan.row } } }] }),
    });
    await audit(target.book, viewer.email, `Delete ${plan.sheet} (dashboard)`, `${plan.id}: ${JSON.stringify(plan.record)}`);
    return { ok: true, message: `Deleted ${isLog ? 'the log entry' : plan.id}.` };
  } catch (e) {
    throw writeError(e, target.book);
  }
}

const isoOrBlank = (v) => (Logic.isStrictIsoDate(String(v || '')) ? String(v) : '');

async function handleDraft(viewer, body) {
  const d = needDrive();
  const ids = (Array.isArray(body.fileIds) ? body.fileIds : []).map(String).slice(0, 5);
  if (!ids.length) throw new HttpError(400, 'Upload a file first.');
  const files = await Promise.all(ids.map((id) => d.download(id)));
  const today = Logic.jakartaToday();
  if (body.kind === 'certificate') {
    const draft = await AI.draftCertificate({ files, evidenceTypes: Config.EVIDENCE_TYPES, today });
    return { ok: true, draft: { ...draft, ValidFrom: isoOrBlank(draft.ValidFrom), ValidUntil: isoOrBlank(draft.ValidUntil) } };
  }
  const code = String(body.projectCode || '');
  const data = await dashboardData(viewer);
  const p = data.projects.find((x) => x.projectCode === code);
  if (!p) throw new HttpError(404, `Project ${code} was not found.`);
  const draft = await AI.draftLogEntry({ project: { code, name: p.name, client: p.client, status: p.status }, recentLog: compactLog(p.log, 20), files, logTypes: Config.LOG_TYPES, today });
  return { ok: true, draft: { ...draft, Date: isoOrBlank(draft.Date), NextMilestoneDate: isoOrBlank(draft.NextMilestoneDate) } };
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'That request is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'The request was not valid JSON.');
  }
}

// --- refresh button -------------------------------------------------------------------

async function forwardRefresh(method, route, viewer) {
  const res = await fetch(REFRESH_URL + route, {
    method,
    headers: { Authorization: `Bearer ${viewer.idToken}` },
    body: method === 'POST' ? '' : undefined,
  });
  let body = {};
  try {
    body = await res.json();
  } catch {
    body = {};
  }
  body.ok = res.status === 200 && body.ok === true;
  if (!body.message && !body.ok) body.message = `The update service answered ${res.status}.`;
  return body;
}

// --- server -----------------------------------------------------------------------

function send(res, status, headers, body) {
  res.writeHead(status, { ...COMMON_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, value) =>
  send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(value));

const routes = {
  'GET /': async (req, res) => send(res, 200, PAGE_HEADERS, html),
  'GET /api/config': async (req, res) => sendJson(res, 200, { clientId: CLIENT_ID, domain: DOMAIN }),
  'GET /api/dashboard': async (req, res) => sendJson(res, 200, await dashboardData(await viewerFrom(req))),
  'GET /api/status': async (req, res) => sendJson(res, 200, await forwardRefresh('GET', '/status', await viewerFrom(req))),
  'POST /api/refresh': async (req, res) => sendJson(res, 200, await forwardRefresh('POST', '/refresh', await viewerFrom(req))),
  'POST /api/edit': async (req, res) => {
    const viewer = await viewerFrom(req);
    sendJson(res, 200, await applyEdit(viewer, await readJson(req)));
  },
  'POST /api/log': async (req, res) => {
    const viewer = await viewerFrom(req);
    sendJson(res, 200, await applyLog(viewer, await readJson(req)));
  },
  'POST /api/upload': async (req, res) => {
    const viewer = await viewerFrom(req);
    sendJson(res, 200, await handleUpload(req, viewer));
  },
  'POST /api/ai/draft': async (req, res) => {
    const viewer = await viewerFrom(req);
    sendJson(res, 200, await handleDraft(viewer, await readJson(req)));
  },
  'POST /api/ai/ask': async (req, res) => {
    const viewer = await viewerFrom(req);
    await handleAsk(viewer, await readJson(req), res);
  },
  'POST /api/delete': async (req, res) => {
    const viewer = await viewerFrom(req);
    sendJson(res, 200, await applyDelete(viewer, await readJson(req)));
  },
};

export const server = http.createServer(async (req, res) => {
  const route = routes[`${req.method} ${new URL(req.url, 'http://x').pathname}`];
  const started = Date.now();
  let status = 200;
  try {
    if (!route) {
      status = 404;
      sendJson(res, 404, { ok: false, message: 'Not found.' });
      return;
    }
    await route(req, res);
  } catch (e) {
    status = e instanceof HttpError ? e.status : 500;
    if (!(e instanceof HttpError)) console.error(e);
    if (res.headersSent) res.end(); // a streamed answer already started
    else sendJson(res, status, { ok: false, message: e instanceof HttpError ? e.message : 'The dashboard server hit an error. Try again in a minute.' });
  } finally {
    console.log(`${req.method} ${req.url.split('?')[0]} ${status} ${Date.now() - started}ms`);
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  server.listen(PORT, () => console.log(`itn-dashboard listening on ${PORT}`));
}
