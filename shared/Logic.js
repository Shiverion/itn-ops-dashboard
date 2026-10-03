/**
 * Logic.js — PURE functions only. No SpreadsheetApp, MailApp, FormApp, or any
 * other Apps Script global may appear in this file. This is what lets it run
 * unmodified under node:test as well as inside the Apps Script runtime.
 *
 * This file is the single source of truth. Copies live at admin/src/Logic.js
 * and dashboard/src/Logic.js (each Apps Script project needs its own file),
 * kept byte-identical by scripts/sync-shared.mjs — never edit the copies
 * directly, edit this file and re-run that script.
 *
 * All "today" reasoning is anchored to Asia/Jakarta (UTC+7, no DST) because
 * that is the project's single operating time zone (see Config.TIME_ZONE).
 */

var JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;
var MS_PER_DAY = 24 * 60 * 60 * 1000;

var TENDER_TERMINAL = ['No-Go', 'Won', 'Lost', 'Cancelled'];

// ---------------------------------------------------------------------------
// Date math (Asia/Jakarta)
// ---------------------------------------------------------------------------

/**
 * Returns the calendar date (Y/M/D) that `instant` falls on in Asia/Jakarta,
 * as a UTC-midnight timestamp usable for whole-day arithmetic.
 */
function jakartaDayStamp(instant) {
  var shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** Y/M/D of `instant` read in Asia/Jakarta, as plain numbers (month is 1-based). */
function jakartaCalendarParts(instant) {
  var shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    date: shifted.getUTCDate()
  };
}

/**
 * Parses a date-only value ("YYYY-MM-DD", or a Date whose Y/M/D should be
 * read directly) into the same UTC-midnight day-stamp space as
 * jakartaDayStamp, so the two are comparable without re-converting time zones.
 */
function dateOnlyStamp(value) {
  if (value instanceof Date) {
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  }
  var parts = String(value).trim().split('-');
  if (parts.length !== 3) return NaN;
  var y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

/**
 * Whole calendar days from `now` (an instant, defaults to real now) to
 * `targetDate` (a date-only value), both read in Asia/Jakarta. Positive =
 * future, negative = past, 0 = today. Returns null if targetDate can't be
 * parsed as a date at all (distinct from "blank", which callers check first).
 */
function daysUntil(targetDate, now) {
  now = now || new Date();
  var targetStamp = dateOnlyStamp(targetDate);
  if (isNaN(targetStamp)) return null;
  var nowStamp = jakartaDayStamp(now);
  return Math.round((targetStamp - nowStamp) / MS_PER_DAY);
}

/**
 * Whole calendar days since `value` (a date-only value) as of `now`, or null
 * if `value` is blank or unparseable — never 0. The inverse of daysUntil,
 * kept separate so a blank/unparseable date can't be mistaken for "updated
 * today" (F14): `-daysUntil(x)` turns an unparseable date into 0 because
 * `-null` coerces to 0 in JavaScript.
 */
function daysSince(value, now) {
  if (!value) return null;
  var daysLeft = daysUntil(value, now);
  if (daysLeft === null) return null;
  return -daysLeft || 0; // avoid returning -0 when daysLeft is 0 (today)
}

/** "YYYY-MM" month key (Asia/Jakarta-agnostic: date-only values have no time zone) for a date-only value, or null if unparseable. */
function monthKeyOf(value) {
  var stamp = dateOnlyStamp(value);
  if (isNaN(stamp)) return null;
  var d = new Date(stamp);
  var m = d.getUTCMonth() + 1;
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : String(m));
}

/** Calendar year of a date-only value, or null if unparseable. */
function yearOf(value) {
  var stamp = dateOnlyStamp(value);
  if (isNaN(stamp)) return null;
  return new Date(stamp).getUTCFullYear();
}

/**
 * Weekday name ("MONDAY", …) of `instant` in Asia/Jakarta, uppercase, to
 * match the Config.DigestWeekday convention.
 */
var WEEKDAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
function jakartaWeekday(instant) {
  var shifted = new Date(instant.getTime() + JAKARTA_OFFSET_MS);
  return WEEKDAY_NAMES[shifted.getUTCDay()];
}

/** True if `instant`'s Jakarta weekday matches `digestWeekday` (case/padding-insensitive). */
function isDigestDay(instant, digestWeekday) {
  return jakartaWeekday(instant) === String(digestWeekday || '').trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Threshold parsing
// ---------------------------------------------------------------------------

/** Parses a "60,30,7,1,0" config string into an array of integers. */
function parseWarnDays(csv) {
  return String(csv || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 0; })
    .map(Number)
    .filter(function (n) { return !isNaN(n); });
}

// ---------------------------------------------------------------------------
// Certificate expiry
// ---------------------------------------------------------------------------

/**
 * Classifies a certificate's expiry for display: Valid / Expiring / Expired /
 * No expiry / Invalid date. `validUntil` may be blank/null for no-expiry
 * items; "Invalid date" is for a value that is present but cannot be parsed
 * as a date at all (text, wrong format, etc.) — this must never silently
 * fall back to "No expiry", since that would hide a real data problem.
 */
function evidenceStatus(validUntil, now) {
  if (validUntil === null || validUntil === undefined || validUntil === '') return 'No expiry';
  var daysLeft = daysUntil(validUntil, now);
  if (daysLeft === null) return 'Invalid date';
  if (daysLeft < 0) return 'Expired';
  if (daysLeft <= 60) return 'Expiring';
  return 'Valid';
}

/**
 * Decides whether today should trigger a certificate reminder, and of what
 * kind. Returns null (no reminder), 'threshold' (daysLeft is one of
 * warnDays), 'expired-weekly' (already expired, only fires on the weekly
 * digest day), or 'invalid-weekly' (value present but unparseable, only
 * fires on the weekly digest day so an unreadable date can't go unnoticed).
 */
function certificateReminderKind(validUntil, now, warnDays, digestWeekday) {
  if (!validUntil) return null;
  var daysLeft = daysUntil(validUntil, now);
  if (daysLeft === null) {
    return isDigestDay(now, digestWeekday) ? 'invalid-weekly' : null;
  }
  if (daysLeft < 0) {
    return isDigestDay(now, digestWeekday) ? 'expired-weekly' : null;
  }
  return warnDays.indexOf(daysLeft) !== -1 ? 'threshold' : null;
}

// ---------------------------------------------------------------------------
// Tenders
// ---------------------------------------------------------------------------

var TENDER_STAGES = [
  { key: 'RegistrationDeadline', label: 'Registration' },
  { key: 'AanwijzingDate', label: 'Aanwijzing' },
  { key: 'QnADeadline', label: 'Q&A' },
  { key: 'SubmissionDeadline', label: 'Submission' }
];

/**
 * Returns the tender stages due for a reminder today: those with a date set,
 * whose daysLeft is one of warnDays, excluding terminal-status tenders and
 * excluding the Submission stage once the tender is already Submitted.
 */
function tenderStagesDue(tender, now, warnDays) {
  if (TENDER_TERMINAL.indexOf(tender.Status) !== -1) return [];
  var due = [];
  for (var i = 0; i < TENDER_STAGES.length; i++) {
    var stage = TENDER_STAGES[i];
    var value = tender[stage.key];
    if (!value) continue;
    if (stage.key === 'SubmissionDeadline' && tender.Status === 'Submitted') continue;
    var daysLeft = daysUntil(value, now);
    if (daysLeft !== null && warnDays.indexOf(daysLeft) !== -1) {
      due.push({ key: stage.key, label: stage.label, date: value, daysLeft: daysLeft });
    }
  }
  return due;
}

/**
 * The single next upcoming stage date for a tender (for dashboard display
 * and digest "deadline" lists), or null if the tender is terminal-status or
 * every stage date is in the past or unset. The terminal-status check here
 * is what keeps Lost/Won/Cancelled/No-Go tenders out of every deadline list
 * that's built from this function, in one place.
 */
function nextTenderStage(tender, now) {
  if (TENDER_TERMINAL.indexOf(tender.Status) !== -1) return null;
  var best = null;
  for (var i = 0; i < TENDER_STAGES.length; i++) {
    var stage = TENDER_STAGES[i];
    var value = tender[stage.key];
    if (!value) continue;
    var daysLeft = daysUntil(value, now);
    if (daysLeft === null || daysLeft < 0) continue;
    if (best === null || daysLeft < best.daysLeft) {
      best = { key: stage.key, label: stage.label, date: value, daysLeft: daysLeft };
    }
  }
  return best;
}

/** True if the tender's addendum was changed within the last `withinDays` days. */
function isRecentAddendum(lastAddendumDate, now, withinDays) {
  if (!lastAddendumDate) return false;
  var daysLeft = daysUntil(lastAddendumDate, now);
  if (daysLeft === null) return false;
  var daysSince = -daysLeft;
  return daysSince >= 0 && daysSince <= (withinDays === undefined ? 7 : withinDays);
}

// ---------------------------------------------------------------------------
// Stale projects
// ---------------------------------------------------------------------------

/**
 * True if an Active project's LastUpdateDate is older than staleDays, or
 * missing entirely. Non-Active projects are never considered stale.
 */
function isStaleProject(project, now, staleDays) {
  if (project.Status !== 'Active') return false;
  if (!project.LastUpdateDate) return true;
  var daysLeft = daysUntil(project.LastUpdateDate, now);
  if (daysLeft === null) return true;
  var daysSince = -daysLeft;
  return daysSince > staleDays;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

var HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes a value for safe insertion into HTML text/attribute content. */
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (ch) {
    return HTML_ESCAPES[ch];
  });
}

// ---------------------------------------------------------------------------
// URL allowlisting
// ---------------------------------------------------------------------------

/**
 * Hosts that may ever be rendered as a clickable link. Anything else —
 * including other https:// hosts — is shown as plain text instead, so a
 * phishing link pasted into a sheet or form can't become clickable.
 */
var SAFE_URL_HOSTS = ['drive.google.com', 'docs.google.com', 'mail.google.com'];

/**
 * True only for an absolute https:// URL whose host is exactly one of
 * SAFE_URL_HOSTS (no subdomains, no userinfo tricks like
 * "https://drive.google.com@evil.example/", no backslash/control-character
 * tricks that a browser's URL parser would normalize differently than this
 * check would otherwise see). This is the one
 * implementation of the rule — both the server (WebApp.js) and this test
 * suite use it; the dashboard's client-side HTML never re-implements it, it
 * only renders what the server already decided.
 */
function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  var trimmed = url.trim();
  if (/[\s\\\u0000-\u001f\u007f]/.test(trimmed)) return false;
  var hostPattern = SAFE_URL_HOSTS.map(function (h) {
    return h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('|');
  var re = new RegExp('^https://(?:' + hostPattern + ')(?:[\\/?#]|$)', 'i');
  return re.test(trimmed);
}

// ---------------------------------------------------------------------------
// Recipient domain filtering
// ---------------------------------------------------------------------------

var BARE_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * True only for a bare "user@domain" address (no display-name wrapper, no
 * surrounding whitespace tricks) whose domain exactly matches allowedDomain
 * case-insensitively. Subdomains of allowedDomain are rejected on purpose:
 * only an exact match is trusted to receive internal reminders.
 */
function isAllowedRecipient(email, allowedDomain) {
  if (typeof email !== 'string') return false;
  var trimmed = email.trim();
  if (!BARE_EMAIL_RE.test(trimmed)) return false;
  var atIdx = trimmed.lastIndexOf('@');
  var domain = trimmed.slice(atIdx + 1).toLowerCase();
  return domain === String(allowedDomain || '').toLowerCase();
}

/**
 * Splits a comma-separated recipient string, validates each address against
 * allowedDomain, and returns { allowed: [...], dropped: [...] } (both
 * deduplicated, allowed lower-cased for consistent MailApp delivery).
 */
function filterRecipients(csv, allowedDomain) {
  var seenAllowed = {};
  var seenDropped = {};
  var allowed = [];
  var dropped = [];
  String(csv || '').split(',').forEach(function (raw) {
    var email = raw.trim();
    if (!email) return;
    if (isAllowedRecipient(email, allowedDomain)) {
      var lower = email.toLowerCase();
      if (!seenAllowed[lower]) { seenAllowed[lower] = true; allowed.push(lower); }
    } else {
      if (!seenDropped[email]) { seenDropped[email] = true; dropped.push(email); }
    }
  });
  return { allowed: allowed, dropped: dropped };
}

// ---------------------------------------------------------------------------
// ID format validation
// ---------------------------------------------------------------------------

var PROJECT_CODE_RE = /^P-\d{4}-\d{3}$/;
var TENDER_ID_RE = /^T-\d{4}-\d{3}$/;

function isValidProjectCode(code) { return PROJECT_CODE_RE.test(String(code || '')); }
function isValidTenderId(id) { return TENDER_ID_RE.test(String(id || '')); }

/** Next sequential P-YYYY-NNN code for `year`, given existing codes for that year. */
function nextProjectCode(existingCodes, year) {
  return nextSequentialCode(existingCodes, year, 'P');
}

function nextTenderId(existingCodes, year) {
  return nextSequentialCode(existingCodes, year, 'T');
}

function nextSequentialCode(existingCodes, year, prefix) {
  var re = new RegExp('^' + prefix + '-' + year + '-(\\d{3})$');
  var max = 0;
  (existingCodes || []).forEach(function (code) {
    var m = re.exec(String(code || ''));
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  });
  var next = max + 1;
  var padded = (next < 10 ? '00' : next < 100 ? '0' : '') + next;
  return prefix + '-' + year + '-' + padded;
}

// ---------------------------------------------------------------------------
// Formula injection
// ---------------------------------------------------------------------------

/**
 * Prefixes a value with "'" if it starts with =, +, - or @ — the characters
 * Sheets treats as the start of a formula on appendRow/setValue. Apply this
 * to every free-text field taken from a source outside admin control (the
 * weekly update form) before it is ever written to a sheet.
 */
function sanitizeForSheet(value) {
  var str = String(value === null || value === undefined ? '' : value);
  if (/^[=+\-@]/.test(str)) return "'" + str;
  return str;
}

// ---------------------------------------------------------------------------
// Digest assembly — operations and finance are built by separate functions
// that each only accept the fields they're allowed to show, so there is no
// code path by which a finance figure can end up in the operations digest.
// ---------------------------------------------------------------------------

/**
 * Builds the plain-text (escaped where it will be inserted into HTML by the
 * caller) body of the weekly operations digest. Only ever reads: project
 * progress/update-age/milestone, tender deadlines, certificate expiries.
 * It has no parameter through which finance data could be passed.
 */
function buildOperationsDigest(projects, tenders, evidence, now) {
  now = now || new Date();
  var lines = [];

  lines.push('Active projects:');
  projects.filter(function (p) { return p.Status === 'Active'; }).forEach(function (p) {
    var age = daysSince(p.LastUpdateDate, now);
    lines.push(
      '- ' + p.ProjectCode + ' ' + p.Name + ': ' + (p.PhysicalProgressPct || 0) + '% progress, ' +
      'last update ' + (age === null ? 'never' : age + 'd ago') + ', next: ' +
      (p.NextMilestone || '-') + (p.NextMilestoneDate ? ' (' + p.NextMilestoneDate + ')' : '')
    );
  });

  lines.push('');
  lines.push('Tender deadlines (next 14 days):');
  tenders.forEach(function (t) {
    var stage = nextTenderStage(t, now);
    if (stage && stage.daysLeft <= 14) {
      lines.push('- ' + t.TenderID + ' ' + t.Title + ': ' + stage.label + ' in ' + stage.daysLeft + 'd (' + stage.date + ')');
    }
  });

  lines.push('');
  lines.push('Certificate expiries (next 60 days):');
  evidence.forEach(function (e) {
    var status = evidenceStatus(e.ValidUntil, now);
    if (status === 'Invalid date') {
      lines.push('- ' + e.Type + ' ' + e.NameOrNumber + ': unreadable expiry date (' + e.ValidUntil + ').');
      return;
    }
    var daysLeft = e.ValidUntil ? daysUntil(e.ValidUntil, now) : null;
    if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 60) {
      lines.push('- ' + e.Type + ' ' + e.NameOrNumber + ': expires in ' + daysLeft + 'd (' + e.ValidUntil + ')');
    }
  });

  return lines.join('\n');
}

/**
 * Builds the finance digest body. Separate function, separate recipient
 * list, never merged with buildOperationsDigest's output.
 */
function buildFinanceDigest(financeRows, projectsByCode) {
  projectsByCode = projectsByCode || {};
  var lines = ['Finance summary:'];
  financeRows.forEach(function (f) {
    var project = projectsByCode[f.ProjectCode];
    var physicalPct = project ? (project.PhysicalProgressPct || 0) : 0;
    var billedPct = Math.round(Number(f.BilledPct || 0) * 100);
    var paidPct = Math.round(Number(f.PaidPct || 0) * 100);
    lines.push(
      '- ' + f.ProjectCode + ': billed ' + billedPct + '% vs physical ' + physicalPct +
      '%, paid ' + paidPct + '%'
    );
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Facts (for NotebookLM "Ask ITN") — the AI only ever quotes numbers these
// functions have already computed; it never does arithmetic itself.
// ---------------------------------------------------------------------------

/**
 * Pure computation behind the OpsFacts tab. `data` is { projects, tenders,
 * evidence } — deliberately with no finance parameter, so there is no code
 * path by which a finance figure could end up in OpsFacts.
 */
function computeOpsFacts(data, today) {
  today = today || new Date();
  var projects = (data && data.projects) || [];
  var tenders = (data && data.tenders) || [];
  var evidence = (data && data.evidence) || [];

  var activeProjects = projects.filter(function (p) { return p.Status === 'Active'; });
  var activeProjectDetails = activeProjects.map(function (p) {
    var daysSinceUpdate = daysSince(p.LastUpdateDate, today);
    return {
      projectCode: p.ProjectCode,
      name: p.Name,
      client: p.Client,
      status: p.Status,
      physicalProgressPct: Number(p.PhysicalProgressPct) || 0,
      lastUpdateDate: p.LastUpdateDate || null,
      daysSinceUpdate: daysSinceUpdate,
      nextMilestone: p.NextMilestone || '',
      nextMilestoneDate: p.NextMilestoneDate || null
    };
  });

  var upcomingTenderStages = [];
  tenders.forEach(function (t) {
    if (TENDER_TERMINAL.indexOf(t.Status) !== -1) return;
    TENDER_STAGES.forEach(function (stage) {
      var value = t[stage.key];
      if (!value) return;
      var daysLeft = daysUntil(value, today);
      if (daysLeft !== null && daysLeft >= 0 && daysLeft <= 30) {
        upcomingTenderStages.push({
          tenderId: t.TenderID, title: t.Title, stage: stage.label, date: value, daysLeft: daysLeft
        });
      }
    });
  });
  upcomingTenderStages.sort(function (a, b) { return a.daysLeft - b.daysLeft; });

  var expiringCertificates = [];
  evidence.forEach(function (e) {
    if (!e.ValidUntil) return;
    var status = evidenceStatus(e.ValidUntil, today);
    var daysLeft = daysUntil(e.ValidUntil, today);
    if (daysLeft !== null && daysLeft <= 90) {
      expiringCertificates.push({
        type: e.Type, nameOrNumber: e.NameOrNumber, validUntil: e.ValidUntil, status: status, daysLeft: daysLeft
      });
    }
  });
  expiringCertificates.sort(function (a, b) { return a.daysLeft - b.daysLeft; });

  var tenderStatusCounts = {};
  tenders.forEach(function (t) {
    var status = t.Status || '(blank)';
    tenderStatusCounts[status] = (tenderStatusCounts[status] || 0) + 1;
  });

  return {
    activeProjectCount: activeProjects.length,
    activeProjects: activeProjectDetails,
    upcomingTenderStages: upcomingTenderStages,
    expiringCertificates: expiringCertificates,
    tenderStatusCounts: tenderStatusCounts
  };
}

/**
 * Pure computation behind the FinanceFacts tab. `invoices` are Invoices
 * sheet rows, `finance` are ProjectFinance rows (already filtered to a
 * non-blank ProjectCode by the caller), `projects` are Projects rows.
 * Aging is based on days past the invoice's DueDate if set, else its
 * InvoiceDate, as of `today`: a positive anchor-to-today gap ("not yet due")
 * and an unparseable/blank anchor ("undated") are their own buckets, never
 * folded into "0-30" (F5) — only an anchor that has actually passed lands in
 * one of the four days-past-due buckets.
 */
function computeFinanceFacts(invoices, finance, projects, today) {
  today = today || new Date();
  invoices = invoices || [];
  finance = finance || [];
  projects = projects || [];

  var thisYear = jakartaCalendarParts(today).year;

  var invoicedThisYear = 0;
  var invoicedByMonth = {};
  var collectedThisYear = 0;
  var outstandingTotal = 0;
  var agingBuckets = { 'Not yet due': 0, 'Undated': 0, '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  var invoicedByProject = {};
  var paidByProject = {};
  var overdueInvoices = [];

  invoices.forEach(function (inv) {
    var amount = Number(inv.Amount) || 0;
    var paid = Number(inv.PaidAmount) || 0;

    if (yearOf(inv.InvoiceDate) === thisYear) {
      invoicedThisYear += amount;
      var mKey = monthKeyOf(inv.InvoiceDate);
      if (mKey) invoicedByMonth[mKey] = (invoicedByMonth[mKey] || 0) + amount;
    }

    if (inv.PaidDate && yearOf(inv.PaidDate) === thisYear) {
      collectedThisYear += paid;
    }

    var outstanding = amount - paid;
    if (outstanding > 0) {
      outstandingTotal += outstanding;
      var anchor = inv.DueDate ? inv.DueDate : inv.InvoiceDate;
      var d = daysUntil(anchor, today);
      if (d === null) {
        agingBuckets['Undated'] += outstanding;
      } else if (d > 0) {
        agingBuckets['Not yet due'] += outstanding;
      } else {
        var daysPast = -d;
        if (daysPast <= 30) agingBuckets['0-30'] += outstanding;
        else if (daysPast <= 60) agingBuckets['31-60'] += outstanding;
        else if (daysPast <= 90) agingBuckets['61-90'] += outstanding;
        else agingBuckets['90+'] += outstanding;
        if (daysPast > 0) {
          overdueInvoices.push({
            invoiceNo: inv.InvoiceNo,
            projectCode: inv.ProjectCode,
            anchorDate: anchor,
            daysPast: daysPast,
            outstanding: outstanding
          });
        }
      }
    }

    if (inv.ProjectCode) {
      invoicedByProject[inv.ProjectCode] = (invoicedByProject[inv.ProjectCode] || 0) + amount;
      paidByProject[inv.ProjectCode] = (paidByProject[inv.ProjectCode] || 0) + paid;
    }
  });

  overdueInvoices.sort(function (a, b) { return b.daysPast - a.daysPast; });

  var financeByCode = {};
  finance.forEach(function (f) { if (f.ProjectCode) financeByCode[f.ProjectCode] = f; });

  var perProject = [];
  var backlog = 0;
  projects.filter(function (p) { return p.Status === 'Active'; }).forEach(function (p) {
    var code = p.ProjectCode;
    var f = financeByCode[code];
    var contractValue = f ? (Number(f.ContractValue) || 0) : 0;
    var invoicedToDate = invoicedByProject[code] || 0;
    var paidToDate = paidByProject[code] || 0;
    var invoicedPct = contractValue > 0 ? Math.round((invoicedToDate / contractValue) * 100) : 0;
    var physicalPct = Number(p.PhysicalProgressPct) || 0;
    perProject.push({
      projectCode: code,
      contractValue: contractValue,
      invoicedToDate: invoicedToDate,
      paidToDate: paidToDate,
      invoicedPct: invoicedPct,
      physicalPct: physicalPct,
      gap: physicalPct - invoicedPct
    });
    backlog += Math.max(0, contractValue - invoicedToDate);
  });

  return {
    invoicedThisYear: invoicedThisYear,
    invoicedByMonth: invoicedByMonth,
    collectedThisYear: collectedThisYear,
    outstandingTotal: outstandingTotal,
    agingBuckets: agingBuckets,
    overdueInvoices: overdueInvoices,
    perProject: perProject,
    backlog: backlog
  };
}

// ---------------------------------------------------------------------------
// Draft import validation (admin importDraft)
// ---------------------------------------------------------------------------

var IMPORT_DATE_FIELDS = {
  Evidence: ['ValidFrom', 'ValidUntil'],
  Tenders: ['RegistrationDeadline', 'AanwijzingDate', 'QnADeadline', 'SubmissionDeadline', 'LastAddendumDate'],
  Projects: ['StartDate', 'PlannedEndDate', 'LastUpdateDate', 'NextMilestoneDate']
};

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-31). */
function isStrictIsoDate(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value == null ? '' : value).trim());
  if (!m) return false;
  var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/**
 * Problems with one draft row before it is imported into the Operations
 * sheet; an empty list means it can be imported. `lists` carries the allowed
 * values from admin Config.js: { evidenceTypes, tenderStatuses, projectStatuses }.
 */
function validateImportRow(sheetKey, record, lists) {
  var errors = [];
  function val(k) { return String(record[k] == null ? '' : record[k]).trim(); }
  (IMPORT_DATE_FIELDS[sheetKey] || []).forEach(function (k) {
    if (val(k) && !isStrictIsoDate(val(k))) errors.push(k + ' is not a YYYY-MM-DD date');
  });
  if (sheetKey === 'Evidence') {
    if (lists.evidenceTypes.indexOf(val('Type')) === -1) errors.push('Type "' + val('Type') + '" is not allowed');
    if (!val('NameOrNumber')) errors.push('NameOrNumber is empty');
    if (isStrictIsoDate(val('ValidFrom')) && isStrictIsoDate(val('ValidUntil')) && val('ValidFrom') > val('ValidUntil')) {
      errors.push('ValidFrom is after ValidUntil');
    }
  } else if (sheetKey === 'Tenders') {
    // A blank TenderID is assigned at import time (next free T-YYYY-NNN).
    if (val('TenderID') && !isValidTenderId(val('TenderID'))) errors.push('TenderID must look like T-2026-001 or be left empty');
    if (!val('Title')) errors.push('Title is empty');
    if (lists.tenderStatuses.indexOf(val('Status')) === -1) errors.push('Status "' + val('Status') + '" is not allowed');
  } else if (sheetKey === 'Projects') {
    if (val('ProjectCode') && !isValidProjectCode(val('ProjectCode'))) errors.push('ProjectCode must look like P-2026-001 or be left empty');
    if (!val('Name')) errors.push('Name is empty');
    if (lists.projectStatuses.indexOf(val('Status')) === -1) errors.push('Status "' + val('Status') + '" is not allowed');
    var pct = val('PhysicalProgressPct');
    if (pct && !(Number(pct) >= 0 && Number(pct) <= 100)) errors.push('PhysicalProgressPct must be a number from 0 to 100');
  } else {
    errors.push('Unknown sheet "' + sheetKey + '"');
  }
  return errors;
}

/**
 * Duplicate-detection keys for a row of Evidence, Tenders or Projects. A row
 * is a duplicate if ANY of its keys matches a row already in the sheet: the
 * ID when present, and always a content key, so a draft row without an ID
 * (assigned at import) still matches an existing row for the same tender.
 */
function importKeys(sheetKey, record) {
  function v(k) { return String(record[k] == null ? '' : record[k]).trim().toLowerCase().replace(/\s+/g, ' '); }
  var keys = [];
  if (sheetKey === 'Tenders') {
    if (v('TenderID')) keys.push('T|' + v('TenderID'));
    // A reference number identifies a tender only if it looks like one (has a digit).
    keys.push('TC|' + v('Buyer') + '|' + (/\d/.test(v('ReferenceNo')) ? v('ReferenceNo') : v('Title')));
  } else if (sheetKey === 'Projects') {
    if (v('ProjectCode')) keys.push('P|' + v('ProjectCode'));
    keys.push('PC|' + v('Name') + '|' + v('StartDate'));
  } else {
    keys.push('E|' + v('Type') + '|' + v('NameOrNumber') + '|' + v('ValidUntil'));
  }
  return keys;
}

/** Backwards-compatible single key: the first of importKeys. */
function importKey(sheetKey, record) {
  return importKeys(sheetKey, record)[0];
}

// ---------------------------------------------------------------------------
// Sheets API rows -> records (dashboard)
// ---------------------------------------------------------------------------

/**
 * Converts a Google Sheets date serial number (days since 1899-12-30, in the
 * spreadsheet's own time zone, which setupItnOps sets to Asia/Jakarta) into
 * "yyyy-MM-dd", or "yyyy-MM-dd HH:mm" when withTime is true. The serial
 * already encodes the spreadsheet's local wall-clock time, so the string is
 * built from UTC parts with no further time-zone shift. Returns null for
 * anything that isn't a finite number.
 */
function sheetSerialToString(serial, withTime) {
  if (typeof serial !== 'number' || !isFinite(serial)) return null;
  var d = new Date(Math.round(serial * 86400000) + Date.UTC(1899, 11, 30));
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  var s = d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  if (withTime) s += ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
  return s;
}

/**
 * Turns the `values` array of a Sheets API read (valueRenderOption
 * UNFORMATTED_VALUE, dateTimeRenderOption SERIAL_NUMBER) into one object per
 * data row, keyed by `columns`. Row 1 is the header; fully blank rows are
 * skipped. The API drops trailing empty cells, so a missing cell becomes ''.
 * A number in a `dateColumns` field becomes "yyyy-MM-dd"; in a
 * `dateTimeColumns` field it becomes "yyyy-MM-dd HH:mm" and the raw serial is
 * kept as `_ts` for newest-first sorting. Everything else passes through
 * unchanged (a date typed into a non-date column arrives as a plain number),
 * so every value can be sent through google.script.run.
 */
function sheetValuesToRecords(values, columns, dateColumns, dateTimeColumns) {
  var dateSet = {};
  (dateColumns || []).forEach(function (c) { dateSet[c] = true; });
  var dateTimeSet = {};
  (dateTimeColumns || []).forEach(function (c) { dateTimeSet[c] = true; });
  var rows = values || [];
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i] || [];
    var hasValue = row.some(function (v) { return v !== '' && v !== null && v !== undefined; });
    if (!hasValue) continue;
    var obj = {};
    for (var c = 0; c < columns.length; c++) {
      var field = columns[c];
      var v = (row[c] === undefined || row[c] === null) ? '' : row[c];
      if (dateTimeSet[field] && typeof v === 'number') {
        obj._ts = v;
        obj[field] = sheetSerialToString(v, true);
      } else if (dateSet[field] && typeof v === 'number') {
        obj[field] = sheetSerialToString(v, false);
      } else {
        obj[field] = v;
      }
    }
    obj._sheetRow = i + 1;
    result.push(obj);
  }
  return result;
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Taxes (Finance sheet, Taxes tab)
// ---------------------------------------------------------------------------

var TAX_MONTHLY_TYPES = ['PPN', 'PPh 4(2)', 'PPh 21', 'PPh 23', 'PPh 25'];
var TAX_ANNUAL_TYPE = 'SPT Tahunan Badan';

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** "YYYY-MM-DD" for a calendar date; month is 1-based and may overflow into the next year. */
function isoDate_(year, month, day) {
  var d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate());
}

/**
 * Default pay-by and report-by dates for a tax period. They are written into
 * each row and can be edited there; due dates on weekends or holidays are not
 * moved (the alerts start a week earlier).
 * - PPh 4(2), 21, 23, 25 ("YYYY-MM"): pay by the 15th, report by the 20th of the next month.
 * - PPN ("YYYY-MM"): pay and report by the end of the next month.
 * - SPT Tahunan Badan ("YYYY"): pay (PPh 29) and report by 30 April of the next year.
 * Returns null for a period that doesn't fit the type.
 */
function taxDueDates(taxType, period) {
  period = String(period || '').trim();
  if (taxType === TAX_ANNUAL_TYPE) {
    if (!/^\d{4}$/.test(period)) return null;
    var annual = isoDate_(Number(period) + 1, 4, 30);
    return { payDue: annual, reportDue: annual };
  }
  if (TAX_MONTHLY_TYPES.indexOf(taxType) === -1) return null;
  var m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  var year = Number(m[1]);
  var month = Number(m[2]) + 1;
  if (taxType === 'PPN') {
    var end = isoDate_(year, month + 1, 0); // day 0 of the month after = last day of `month`
    return { payDue: end, reportDue: end };
  }
  return { payDue: isoDate_(year, month, 15), reportDue: isoDate_(year, month, 20) };
}

/** Stable row ID for a tax period, e.g. "PPh21-2026-09". */
function taxId(taxType, period) {
  return String(taxType).replace(/[^A-Za-z0-9]/g, '') + '-' + String(period).trim();
}

/**
 * Tax rows that should exist but don't: every monthly type for last month and
 * this month (in Jakarta), and, from January to April, last year's annual return.
 */
function taxRowsToAdd(existing, now) {
  var have = {};
  (existing || []).forEach(function (r) { have[r.TaxType + '|' + String(r.Period).trim()] = true; });
  var p = jakartaCalendarParts(now || new Date());
  var prevYear = p.month === 1 ? p.year - 1 : p.year;
  var prevMonth = p.month === 1 ? 12 : p.month - 1;
  var periods = [prevYear + '-' + pad2_(prevMonth), p.year + '-' + pad2_(p.month)];
  var wanted = [];
  periods.forEach(function (period) {
    TAX_MONTHLY_TYPES.forEach(function (t) { wanted.push([t, period]); });
  });
  if (p.month <= 4) wanted.push([TAX_ANNUAL_TYPE, String(p.year - 1)]);
  return wanted.filter(function (w) { return !have[w[0] + '|' + w[1]]; }).map(function (w) {
    var due = taxDueDates(w[0], w[1]);
    return {
      TaxID: taxId(w[0], w[1]), TaxType: w[0], Period: w[1], Amount: '',
      PayDueDate: due.payDue, PaidDate: '', BillingCode: '', NTPN: '',
      ReportDueDate: due.reportDue, ReportedDate: '', Status: '', Notes: ''
    };
  });
}

/**
 * Where a tax row stands: { state, action, due, daysLeft, label }.
 * state: done | overdue | due-soon (7 days or less) | upcoming | undated.
 * Status overrides: "Not applicable" (nothing to do), "Withheld by client"
 * (the client pays and reports), "Nil return" (nothing to pay, still report).
 */
function taxStatus(row, now) {
  var status = String(row.Status || '').trim();
  if (status === 'Not applicable') return { state: 'done', action: null, due: null, daysLeft: null, label: 'Not applicable' };
  if (status === 'Withheld by client') return { state: 'done', action: null, due: null, daysLeft: null, label: 'Withheld by client' };
  var steps = [];
  if (!row.PaidDate && status !== 'Nil return') steps.push({ action: 'Pay', due: row.PayDueDate });
  if (!row.ReportedDate) steps.push({ action: 'Report', due: row.ReportDueDate });
  if (!steps.length) {
    return { state: 'done', action: null, due: null, daysLeft: null, label: status === 'Nil return' ? 'Nil return reported' : 'Paid and reported' };
  }
  steps.forEach(function (s) { s.daysLeft = s.due ? daysUntil(s.due, now) : null; });
  steps.sort(function (a, b) {
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });
  var next = steps[0];
  if (next.daysLeft === null) return { state: 'undated', action: next.action, due: null, daysLeft: null, label: next.action + ': no due date' };
  var d = next.daysLeft;
  var state = d < 0 ? 'overdue' : d <= 7 ? 'due-soon' : 'upcoming';
  var label = d < 0 ? next.action + ' overdue by ' + (-d) + (d === -1 ? ' day' : ' days')
    : d === 0 ? next.action + ' due today'
    : d <= 7 ? next.action + ' due in ' + d + (d === 1 ? ' day' : ' days')
    : next.action + ' by ' + next.due;
  return { state: state, action: next.action, due: next.due, daysLeft: d, label: label };
}

// ---------------------------------------------------------------------------
// Revenue (invoices and contracts)
// ---------------------------------------------------------------------------

/**
 * Invoiced per month this year and last year, collected per month this year,
 * year-to-date totals compared with the same period last year, and contract
 * value per contract year (undated contracts counted separately).
 */
function computeRevenue(invoices, contracts, now) {
  var p = jakartaCalendarParts(now || new Date());
  function zeros() { var a = []; for (var i = 0; i < 12; i++) a.push(0); return a; }
  function parts(value) {
    var s = dateOnlyStamp(value);
    if (!value || isNaN(s)) return null;
    var d = new Date(s);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }
  var invoiced = zeros(), invoicedLast = zeros(), collected = zeros();
  var ytd = 0, lastYtd = 0;
  var todayKey = p.month * 100 + p.date;
  (invoices || []).forEach(function (inv) {
    var amount = Number(inv.Amount) || 0;
    var d = parts(inv.InvoiceDate);
    if (d && d.year === p.year) { invoiced[d.month - 1] += amount; ytd += amount; }
    if (d && d.year === p.year - 1) {
      invoicedLast[d.month - 1] += amount;
      if (d.month * 100 + d.day <= todayKey) lastYtd += amount;
    }
    var paid = parts(inv.PaidDate);
    if (paid && paid.year === p.year) collected[paid.month - 1] += Number(inv.PaidAmount) || 0;
  });
  var byYear = {}, undated = { total: 0, count: 0 }, total = 0;
  (contracts || []).forEach(function (c) {
    var value = Number(c.ContractValue) || 0;
    total += value;
    var y = c.ContractDate ? yearOf(c.ContractDate) : null;
    if (y === null) { undated.total += value; undated.count++; return; }
    var slot = byYear[y] || (byYear[y] = { year: y, total: 0, count: 0 });
    slot.total += value;
    slot.count++;
  });
  return {
    year: p.year,
    month: p.month,
    invoicedByMonth: invoiced,
    invoicedLastYearByMonth: invoicedLast,
    collectedByMonth: collected,
    invoicedYtd: ytd,
    invoicedLastYearToDate: lastYtd,
    contractsByYear: Object.keys(byYear).sort().map(function (k) { return byYear[k]; }),
    contractsUndated: undated,
    contractsTotal: total,
    contractsCount: (contracts || []).length
  };
}

// ---------------------------------------------------------------------------
// Edits from the web dashboard (planned here, written by web/server.mjs)
// ---------------------------------------------------------------------------

/** A sheet serial number for a "YYYY-MM-DD" date (whole days since 1899-12-30). */
function isoToSheetSerial(iso) {
  var s = dateOnlyStamp(iso);
  return isNaN(s) ? null : Math.round((s - Date.UTC(1899, 11, 30)) / MS_PER_DAY);
}

/** A sheet serial number (with time) for an instant, in Asia/Jakarta. */
function instantToSheetSerial(instant) {
  return (instant.getTime() + JAKARTA_OFFSET_MS - Date.UTC(1899, 11, 30)) / MS_PER_DAY;
}

/** Today's date in Asia/Jakarta as "YYYY-MM-DD". */
function jakartaToday(now) {
  var p = jakartaCalendarParts(now || new Date());
  return p.year + '-' + pad2_(p.month) + '-' + pad2_(p.date);
}

/**
 * What each kind of edit may touch. `book` is the spreadsheet (ops or
 * finance); `id` is the column that identifies a row (Evidence has none: its
 * rows are found by importKey); `create` lists extra fields allowed only when
 * adding a row. Formula columns (ProjectFinance BilledToDate…PaidPct) and
 * computed ones (Evidence Status) are never listed.
 */
var EDIT_TARGETS = {
  project: {
    sheet: 'Projects', book: 'ops', id: 'ProjectCode', numbers: ['PhysicalProgressPct'],
    fields: ['Name', 'Client', 'Location', 'Status', 'PMEmail', 'StartDate', 'PlannedEndDate', 'PhysicalProgressPct',
      'LastUpdateDate', 'NextMilestone', 'NextMilestoneDate', 'DriveFolderURL', 'Aliases', 'Notes']
  },
  tender: {
    sheet: 'Tenders', book: 'ops', id: 'TenderID', numbers: [],
    fields: ['Title', 'Buyer', 'PortalOrSource', 'ReferenceNo', 'RegistrationDeadline', 'AanwijzingDate', 'QnADeadline',
      'SubmissionDeadline', 'Status', 'OwnerEmail', 'LastAddendumDate', 'AddendumNotes', 'DocumentsURL', 'ScreeningSummary', 'LinkedProjectCode']
  },
  evidence: {
    sheet: 'Evidence', book: 'ops', id: null, numbers: [],
    fields: ['Type', 'NameOrNumber', 'Issuer', 'Scope', 'ValidFrom', 'ValidUntil', 'DocumentURL', 'OwnerEmail']
  },
  invoice: {
    sheet: 'Invoices', book: 'finance', id: 'InvoiceNo', numbers: ['Amount', 'PaidAmount'], create: ['InvoiceNo'],
    fields: ['ProjectCode', 'InvoiceDate', 'Amount', 'Currency', 'DueDate', 'PaidDate', 'PaidAmount', 'Notes']
  },
  contract: {
    sheet: 'Contracts', book: 'finance', id: 'ContractNo', numbers: ['ContractValue'], create: ['ContractNo'],
    fields: ['Title', 'Client', 'ProjectCode', 'ContractValue', 'Currency', 'ContractDate', 'CompletionDate', 'DocumentType', 'DocumentURL', 'Notes']
  },
  tax: {
    sheet: 'Taxes', book: 'finance', id: 'TaxID', numbers: ['Amount'], create: ['TaxType', 'Period'],
    fields: ['Amount', 'PayDueDate', 'PaidDate', 'BillingCode', 'NTPN', 'ReportDueDate', 'ReportedDate', 'Status', 'Notes']
  },
  projectFinance: {
    sheet: 'ProjectFinance', book: 'finance', id: 'ProjectCode', numbers: ['ContractValue'], create: ['ProjectCode'],
    fields: ['ContractValue', 'Currency', 'Notes']
  }
};

var EDIT_MAX_TEXT = 2000;
var EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** Problems with an edited record (empty list = fine). ctx: { lists, projectCodes }. */
function validateEdit(kind, r, ctx) {
  var errors = [];
  var lists = ctx.lists;
  function val(k) { return String(r[k] == null ? '' : r[k]).trim(); }
  function date(k, required) {
    if (!val(k)) { if (required) errors.push(k + ' is required'); return; }
    if (!isStrictIsoDate(val(k))) errors.push(k + ' is not a YYYY-MM-DD date');
  }
  function amount(k, required) {
    if (!val(k)) { if (required) errors.push(k + ' is required'); return; }
    if (!(Number(val(k)) >= 0)) errors.push(k + ' must be a number of 0 or more');
  }
  function email(k) { if (val(k) && !EMAIL_RE.test(val(k))) errors.push(k + ' is not an email address'); }
  function url(k) { if (val(k) && !/^https:\/\/\S+$/i.test(val(k))) errors.push(k + ' must be an https:// link'); }
  function projectCode(k, required) {
    if (!val(k)) { if (required) errors.push(k + ' is required'); return; }
    if (!isValidProjectCode(val(k))) errors.push(k + ' must look like P-2026-001');
    else if (ctx.projectCodes && ctx.projectCodes.indexOf(val(k)) === -1) errors.push(k + ' ' + val(k) + ' is not in the project register');
  }
  function oneOf(k, options) { if (options.indexOf(val(k)) === -1) errors.push(k + ' "' + val(k) + '" is not allowed'); }

  Object.keys(r).forEach(function (k) {
    if (typeof r[k] === 'string' && r[k].length > EDIT_MAX_TEXT) errors.push(k + ' is too long');
  });
  if (kind === 'project' || kind === 'tender' || kind === 'evidence') {
    errors = errors.concat(validateImportRow(EDIT_TARGETS[kind].sheet, r, lists));
    if (kind === 'project') { email('PMEmail'); url('DriveFolderURL'); }
    if (kind === 'tender') { email('OwnerEmail'); url('DocumentsURL'); if (val('LinkedProjectCode')) projectCode('LinkedProjectCode'); }
    if (kind === 'evidence') { email('OwnerEmail'); url('DocumentURL'); }
  } else if (kind === 'invoice') {
    if (!val('InvoiceNo')) errors.push('InvoiceNo is required');
    projectCode('ProjectCode', true);
    date('InvoiceDate', true); date('DueDate'); date('PaidDate');
    amount('Amount', true); amount('PaidAmount');
    if (val('Amount') && !(Number(val('Amount')) > 0)) errors.push('Amount must be more than 0');
    if (Number(val('PaidAmount')) > Number(val('Amount'))) errors.push('PaidAmount is more than Amount');
    if (Number(val('PaidAmount')) > 0 && !val('PaidDate')) errors.push('PaidDate is required when PaidAmount is set');
    oneOf('Currency', lists.currencies);
  } else if (kind === 'contract') {
    if (!val('ContractNo')) errors.push('ContractNo is required');
    if (!val('Title')) errors.push('Title is required');
    amount('ContractValue', true);
    date('ContractDate'); date('CompletionDate'); url('DocumentURL');
    if (val('ProjectCode')) projectCode('ProjectCode');
    oneOf('Currency', lists.currencies);
  } else if (kind === 'tax') {
    oneOf('TaxType', lists.taxTypes);
    if (!taxDueDates(val('TaxType'), val('Period'))) errors.push('Period must be YYYY-MM (or YYYY for the annual return)');
    amount('Amount');
    date('PayDueDate', true); date('ReportDueDate', true); date('PaidDate'); date('ReportedDate');
    oneOf('Status', lists.taxStatuses);
  } else if (kind === 'projectFinance') {
    projectCode('ProjectCode', true);
    amount('ContractValue', true);
    oneOf('Currency', lists.currencies);
  } else {
    errors.push('Unknown edit "' + kind + '"');
  }
  return errors;
}

/** Index (0-based, into values) of the last row with any value, or 0 (the header) if none. */
function lastUsedRowIndex(values) {
  for (var i = (values || []).length - 1; i > 0; i--) {
    var row = values[i] || [];
    for (var c = 0; c < row.length; c++) {
      if (row[c] !== '' && row[c] !== null && row[c] !== undefined) return i;
    }
  }
  return 0;
}

/**
 * The value written to a cell: numbers as numbers, text as typed, dates as
 * "YYYY-MM-DD". The writer sends date cells with USER_ENTERED (so Sheets
 * stores a real, date-formatted date) and everything else RAW (so text that
 * starts with "=" is never run as a formula); plan.dateCells lists which is which.
 */
function toCellValue(column, value, dateColumns, numberColumns) {
  var s = value == null ? '' : String(value).trim();
  if (s === '') return '';
  if (numberColumns.indexOf(column) !== -1) return Number(s);
  return s;
}

/**
 * Plans one add or change to a register sheet. Pure: takes the sheet's
 * current values (header row first) and returns the cells to write, or
 * { errors }. request: { id?: the existing row's ID (Evidence: its importKey), fields }.
 * ctx: { columns, dateColumns, lists, projectCodes, now }.
 * Result: { sheet, book, row (1-based), cells: { Column: value }, dateCells: [Column], id, created, changes: [[column, before, after]] }.
 */
function planEdit(kind, values, request, ctx) {
  var target = EDIT_TARGETS[kind];
  if (!target) return { errors: ['Unknown edit "' + kind + '"'] };
  var columns = ctx.columns[target.sheet];
  var dateCols = ctx.dateColumns[target.sheet] || [];
  var records = sheetValuesToRecords(values || [], columns, dateCols, []);
  var fields = request.fields || {};
  var allowed = target.fields.concat(request.id ? [] : (target.create || []));
  var clean = {};
  Object.keys(fields).forEach(function (k) {
    if (allowed.indexOf(k) !== -1) clean[k] = fields[k] == null ? '' : String(fields[k]).trim();
  });

  function idOf(rec) { return target.id ? String(rec[target.id] == null ? '' : rec[target.id]).trim() : importKey('Evidence', rec); }
  var existing = null;
  if (request.id) {
    for (var i = 0; i < records.length; i++) {
      if (idOf(records[i]) === String(request.id).trim()) { existing = records[i]; break; }
    }
    if (!existing) return { errors: ['This row was not found. It may have been changed or removed in the sheet; reload and try again.'] };
  }

  var base = {};
  columns.forEach(function (c) { base[c] = existing && existing[c] !== undefined && existing[c] !== null ? String(existing[c]) : ''; });
  var merged = {};
  columns.forEach(function (c) { merged[c] = Object.prototype.hasOwnProperty.call(clean, c) ? clean[c] : base[c]; });

  var generated = [];
  if (!existing) {
    var year = jakartaCalendarParts(ctx.now || new Date()).year;
    if (kind === 'project') { merged.ProjectCode = nextProjectCode(records.map(function (r) { return r.ProjectCode; }), year); generated.push('ProjectCode'); }
    if (kind === 'tender') { merged.TenderID = nextTenderId(records.map(function (r) { return r.TenderID; }), year); generated.push('TenderID'); }
    if ((kind === 'invoice' || kind === 'contract' || kind === 'projectFinance') && !merged.Currency) { merged.Currency = 'IDR'; generated.push('Currency'); }
    if (kind === 'tax') {
      var due = taxDueDates(merged.TaxType, merged.Period);
      merged.TaxID = taxId(merged.TaxType, merged.Period);
      generated.push('TaxID');
      if (due && !merged.PayDueDate) merged.PayDueDate = due.payDue;
      if (due && !merged.ReportDueDate) merged.ReportDueDate = due.reportDue;
    }
  }

  var errors = validateEdit(kind, merged, ctx);
  if (!errors.length) {
    var newId = idOf(merged);
    if (target.id && !existing && records.some(function (r) { return idOf(r) === newId; })) {
      errors.push(target.id + ' ' + newId + ' already exists');
    }
    if (kind === 'project' || kind === 'tender' || kind === 'evidence') {
      // Same content key as another row (buyer + reference, name + start date, type + number + expiry).
      var mine = importKeys(target.sheet, merged).filter(function (k) { return !/^(T|P)\|/.test(k); });
      records.forEach(function (r) {
        if (r === existing) return;
        var theirs = importKeys(target.sheet, r);
        if (mine.some(function (k) { return theirs.indexOf(k) !== -1; })) {
          errors.push('This looks like a duplicate of ' + (target.id ? (r[target.id] || 'a row') : r.NameOrNumber) + ' already in the sheet');
        }
      });
    }
  }
  if (errors.length) return { errors: errors };

  var writable = target.fields.concat(existing ? [] : (target.create || []).concat(generated));
  var cells = {};
  var changes = [];
  columns.forEach(function (c) {
    if (writable.indexOf(c) === -1) return;
    if (existing ? merged[c] === base[c] : merged[c] === '') return;
    cells[c] = toCellValue(c, merged[c], dateCols, target.numbers);
    changes.push([c, base[c], merged[c]]);
  });

  return {
    sheet: target.sheet,
    book: target.book,
    row: existing ? existing._sheetRow : lastUsedRowIndex(values) + 2,
    cells: cells,
    dateCells: Object.keys(cells).filter(function (c) { return dateCols.indexOf(c) !== -1; }),
    id: idOf(merged),
    created: !existing,
    changes: changes
  };
}

/**
 * Plans deleting one register row. Pure: finds the row by the same ID planEdit
 * uses and returns { sheet, book, row, id, record } (record = the row's fields,
 * kept in the AuditLog so a deletion can be undone by hand), or { errors }.
 * ProjectFinance rows are never deleted: row 2 holds the sheet's ARRAYFORMULAs.
 */
function planDelete(kind, values, id, ctx) {
  if (kind === 'projectFinance') return { errors: ['A contract value can’t be deleted; change it instead.'] };
  var target = EDIT_TARGETS[kind];
  if (!target) return { errors: ['Unknown kind "' + kind + '"'] };
  var columns = ctx.columns[target.sheet];
  var records = sheetValuesToRecords(values || [], columns, ctx.dateColumns[target.sheet] || [], []);
  var wanted = String(id || '').trim();
  var found = null;
  for (var i = 0; i < records.length && wanted; i++) {
    var rid = target.id ? String(records[i][target.id] == null ? '' : records[i][target.id]).trim() : importKey('Evidence', records[i]);
    if (rid === wanted) { found = records[i]; break; }
  }
  if (!found || found._sheetRow < 2) return { errors: ['This row was not found. It may have been changed or removed in the sheet; reload and try again.'] };
  return { sheet: target.sheet, book: target.book, row: found._sheetRow, id: wanted, record: rawFields(found, columns) };
}

/**
 * Plans deleting one ProjectLog entry, identified by its sheet row and checked
 * against its project and timestamp (so a row that moved isn't deleted by mistake).
 * entry: { row, projectCode, timestamp ("YYYY-MM-DD HH:MM", as in the payload) }.
 */
function planDeleteLogEntry(values, entry, ctx) {
  var columns = ctx.columns.ProjectLog;
  var records = sheetValuesToRecords(values || [], columns, ctx.dateColumns.ProjectLog || [], ['Timestamp']);
  var row = Number(entry.row);
  var found = null;
  for (var i = 0; i < records.length; i++) {
    if (records[i]._sheetRow === row) { found = records[i]; break; }
  }
  if (!found || row < 2 || String(found.ProjectCode).trim() !== String(entry.projectCode || '').trim() ||
      String(found.Timestamp) !== String(entry.timestamp || '')) {
    return { errors: ['This log entry was not found. It may have been changed in the sheet; reload and try again.'] };
  }
  var record = rawFields(found, columns);
  return { sheet: 'ProjectLog', book: 'ops', row: row, id: found.ProjectCode + ' ' + found.Timestamp, record: record };
}

// ---------------------------------------------------------------------------
// Project log entries with attachments (written by web/server.mjs)
// ---------------------------------------------------------------------------

/**
 * The ProjectLog Attachments cell: one file per line, "Name | https://link".
 * Returns [{ name, url, safe }]; lines without a link are skipped.
 */
function parseAttachments(cell) {
  return String(cell || '').split(/\r?\n/).map(function (line) {
    var m = /^(.*?)\s*\|\s*(https:\/\/\S+)\s*$/.exec(line.trim());
    if (!m) return null;
    return { name: m[1] || m[2], url: m[2], safe: isSafeUrl(m[2]) };
  }).filter(function (a) { return a; });
}

/** The Attachments cell for a list of { name, url } (names lose "|" and line breaks). */
function formatAttachments(list) {
  return (list || []).map(function (a) {
    return String(a.name || 'File').replace(/[|\s]+/g, ' ').trim() + ' | ' + a.url;
  }).join('\n');
}

/**
 * Problems with a new log entry (empty list = fine). entry: { Type, Title,
 * Summary, Issues, Date (YYYY-MM-DD, optional), PhysicalProgressPct,
 * NextMilestone, NextMilestoneDate, attachments: [{ name, url }] }.
 */
function validateLogEntry(entry, lists) {
  var errors = [];
  function val(k) { return String(entry[k] == null ? '' : entry[k]).trim(); }
  if (lists.logTypes.indexOf(val('Type')) === -1) errors.push('Kind "' + val('Type') + '" is not allowed');
  if (!val('Title') && !val('Summary')) errors.push('Give the entry a title or a description');
  ['Title', 'Summary', 'Issues', 'NextMilestone'].forEach(function (k) {
    if (val(k).length > EDIT_MAX_TEXT) errors.push(k + ' is too long');
  });
  ['Date', 'NextMilestoneDate'].forEach(function (k) {
    if (val(k) && !isStrictIsoDate(val(k))) errors.push(k + ' is not a YYYY-MM-DD date');
  });
  var pct = val('PhysicalProgressPct');
  if (pct && !(Number(pct) >= 0 && Number(pct) <= 100)) errors.push('Progress must be a number from 0 to 100');
  (entry.attachments || []).forEach(function (a) {
    if (!a || !isSafeUrl(a.url)) errors.push('Attachments must be Google Drive links');
  });
  if ((entry.attachments || []).length > 20) errors.push('At most 20 attachments per entry');
  return errors;
}

// ---------------------------------------------------------------------------
// Dashboard payload (shared by dashboard/src/WebApp.js and web/server.mjs)
// ---------------------------------------------------------------------------

/** StaleUpdateDays from the Config sheet's values (header row first), or the fallback. */
function readStaleUpdateDays(configValues, fallback) {
  var rows = configValues || [];
  for (var i = 1; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === 'StaleUpdateDays') {
      var n = Number(String(rows[i][1]).trim());
      return (!isNaN(n) && n > 0) ? n : fallback;
    }
  }
  return fallback;
}

/** { url, safe } for a raw URL cell; the client renders a link only when safe (isSafeUrl). */
function resolveUrl(rawUrl) {
  return { url: rawUrl || '', safe: isSafeUrl(rawUrl) };
}

/**
 * The dashboard payload: projects (each with its log, newest first), tenders
 * (with their next upcoming stage, soonest first), evidence (with computed
 * status), finance (null unless the caller could read the Finance sheet as
 * the viewer), and the stale-project threshold. Dates are already strings and
 * every URL is resolved through isSafeUrl.
 *
 * input: {
 *   ops: { Projects, ProjectLog, Tenders, Evidence, Config }  raw sheet values (header row first)
 *   finance: ProjectFinance values, or null when the viewer can't read the Finance sheet
 *   financeExtra: { Invoices, Contracts, Taxes } values (optional; a missing tab is left out)
 *   schema: { columns, dateColumns, dateTimeColumns, defaultStaleDays }  from Config.js
 *   options: lists for the edit forms (optional)
 *   now: Date, generatedAt: string, viewerEmail: string|null,
 *   opsSheet / financeSheet: { url, safe } or null
 * }
 * Each project, tender and certificate also carries `raw` (its sheet fields,
 * dates as YYYY-MM-DD) for the edit forms; certificates carry `key` (importKey).
 */
function buildDashboardPayload(input) {
  var now = input.now;
  var schema = input.schema;
  function records(values, sheetKey) {
    return sheetValuesToRecords(values || [], schema.columns[sheetKey], schema.dateColumns[sheetKey], schema.dateTimeColumns[sheetKey]);
  }
  var ops = input.ops;
  var staleUpdateDays = readStaleUpdateDays(ops.Config, schema.defaultStaleDays);
  var projectsRaw = records(ops.Projects, 'Projects');

  var logRaw = records(ops.ProjectLog, 'ProjectLog');
  logRaw.sort(function (a, b) { return (b._ts || 0) - (a._ts || 0); }); // newest first; no/non-date Timestamp sorts as 0

  var logsByProject = {};
  logRaw.forEach(function (entry) {
    var list = logsByProject[entry.ProjectCode] || (logsByProject[entry.ProjectCode] = []);
    var link = resolveUrl(entry.Link);
    list.push({
      timestamp: entry.Timestamp,
      type: entry.Type,
      physicalProgressPct: entry.PhysicalProgressPct,
      summary: entry.Summary,
      issues: entry.Issues,
      nextMilestone: entry.NextMilestone,
      nextMilestoneDate: entry.NextMilestoneDate,
      link: link.url,
      linkSafe: link.safe,
      title: entry.Title || '',
      attachments: parseAttachments(entry.Attachments),
      submittedBy: entry.SubmittedBy || '',
      row: entry._sheetRow
    });
  });

  var projects = projectsRaw.map(function (p) {
    var drive = resolveUrl(p.DriveFolderURL);
    return {
      projectCode: p.ProjectCode,
      name: p.Name,
      client: p.Client,
      location: p.Location,
      status: p.Status,
      pmEmail: p.PMEmail,
      physicalProgressPct: p.PhysicalProgressPct,
      lastUpdateAgeDays: daysSince(p.LastUpdateDate, now),
      nextMilestone: p.NextMilestone,
      nextMilestoneDate: p.NextMilestoneDate,
      nextMilestoneDaysLeft: daysUntil(p.NextMilestoneDate, now),
      driveFolderUrl: drive.url,
      driveFolderUrlSafe: drive.safe,
      aliases: p.Aliases,
      log: logsByProject[p.ProjectCode] || [],
      raw: rawFields(p, schema.columns.Projects)
    };
  });

  var tenders = records(ops.Tenders, 'Tenders').map(function (t) {
    var docs = resolveUrl(t.DocumentsURL);
    return {
      tenderId: t.TenderID,
      title: t.Title,
      buyer: t.Buyer,
      status: t.Status,
      ownerEmail: t.OwnerEmail,
      nextStage: nextTenderStage(t, now), // null for terminal-status tenders
      documentsUrl: docs.url,
      documentsUrlSafe: docs.safe,
      linkedProjectCode: t.LinkedProjectCode,
      raw: rawFields(t, schema.columns.Tenders)
    };
  }).sort(function (a, b) {
    var ad = a.nextStage ? a.nextStage.daysLeft : Infinity;
    var bd = b.nextStage ? b.nextStage.daysLeft : Infinity;
    return ad - bd;
  });

  var evidence = records(ops.Evidence, 'Evidence').map(function (e) {
    var doc = resolveUrl(e.DocumentURL);
    return {
      type: e.Type,
      nameOrNumber: e.NameOrNumber,
      issuer: e.Issuer,
      scope: e.Scope,
      validFrom: e.ValidFrom,
      validUntil: e.ValidUntil,
      documentUrl: doc.url,
      documentUrlSafe: doc.safe,
      ownerEmail: e.OwnerEmail,
      status: evidenceStatus(e.ValidUntil, now),
      daysLeft: daysUntil(e.ValidUntil, now),
      key: importKey('Evidence', e),
      raw: rawFields(e, schema.columns.Evidence)
    };
  });

  var finance = null;
  var financeDetail = null;
  if (input.finance) {
    try {
      var projectsByCode = {};
      projectsRaw.forEach(function (p) { projectsByCode[p.ProjectCode] = p; });
      finance = records(input.finance, 'ProjectFinance').filter(function (f) { return !!f.ProjectCode; }).map(function (f) {
        var project = projectsByCode[f.ProjectCode];
        return {
          projectCode: f.ProjectCode,
          projectName: project ? project.Name : '',
          contractValue: f.ContractValue,
          currency: f.Currency || 'IDR',
          billedPct: f.BilledPct,
          paidPct: f.PaidPct,
          physicalProgressPct: project ? (Number(project.PhysicalProgressPct) || 0) : 0,
          lastInvoiceDate: f.LastInvoiceDate
        };
      });
      financeDetail = buildFinanceDetail(input.financeExtra || {}, records(input.finance, 'ProjectFinance'), projectsRaw, schema, now);
    } catch (e) {
      finance = null;
      financeDetail = null;
    }
  }

  return {
    viewerEmail: input.viewerEmail || null,
    generatedAt: input.generatedAt,
    opsSheet: input.opsSheet || null,
    financeSheet: finance ? (input.financeSheet || null) : null,
    staleUpdateDays: staleUpdateDays,
    projects: projects,
    tenders: tenders,
    evidence: evidence,
    finance: finance,
    revenue: financeDetail ? financeDetail.revenue : null,
    invoices: financeDetail ? financeDetail.invoices : null,
    contracts: financeDetail ? financeDetail.contracts : null,
    taxes: financeDetail ? financeDetail.taxes : null,
    options: input.options || null
  };
}

/** A record's sheet fields only (no _ts/_sheetRow), blanks as ''. */
function rawFields(record, columns) {
  var out = {};
  (columns || []).forEach(function (c) { out[c] = record[c] === undefined || record[c] === null ? '' : record[c]; });
  return out;
}

/**
 * Revenue, invoices, contracts and taxes for viewers who can read the Finance
 * sheet. A tab that doesn't exist yet comes back as null (the dashboard then
 * says to run setup) rather than failing the whole page.
 */
function buildFinanceDetail(extra, financeRecords, projectsRaw, schema, now) {
  function records(sheetKey) {
    if (!extra[sheetKey]) return null;
    return sheetValuesToRecords(extra[sheetKey], schema.columns[sheetKey], schema.dateColumns[sheetKey], []);
  }
  var invoicesRaw = records('Invoices');
  var contractsRaw = records('Contracts');
  var taxesRaw = records('Taxes');
  var names = {};
  projectsRaw.forEach(function (p) { names[p.ProjectCode] = p.Name; });

  var facts = computeFinanceFacts(invoicesRaw || [], financeRecords, projectsRaw, now);
  var revenue = computeRevenue(invoicesRaw || [], contractsRaw || [], now);
  revenue.collectedThisYear = facts.collectedThisYear;
  revenue.outstandingTotal = facts.outstandingTotal;
  revenue.agingBuckets = facts.agingBuckets;
  revenue.backlog = facts.backlog;
  revenue.activeContractValue = facts.perProject.reduce(function (sum, p) { return sum + p.contractValue; }, 0);
  revenue.overdueTotal = facts.overdueInvoices.reduce(function (sum, i) { return sum + i.outstanding; }, 0);

  var invoices = invoicesRaw === null ? null : invoicesRaw.map(function (inv) {
    var amount = Number(inv.Amount) || 0;
    var paid = Number(inv.PaidAmount) || 0;
    var anchor = inv.DueDate || inv.InvoiceDate;
    var d = anchor ? daysUntil(anchor, now) : null;
    return {
      invoiceNo: String(inv.InvoiceNo),
      projectCode: inv.ProjectCode,
      projectName: names[inv.ProjectCode] || '',
      invoiceDate: inv.InvoiceDate,
      dueDate: inv.DueDate,
      amount: amount,
      paidAmount: paid,
      paidDate: inv.PaidDate,
      outstanding: Math.max(0, amount - paid),
      daysOverdue: amount - paid > 0 && d !== null && d < 0 ? -d : 0,
      raw: rawFields(inv, schema.columns.Invoices)
    };
  }).sort(function (a, b) { return String(b.invoiceDate).localeCompare(String(a.invoiceDate)); });

  var contracts = contractsRaw === null ? null : contractsRaw.map(function (c) {
    var doc = resolveUrl(c.DocumentURL);
    return {
      contractNo: String(c.ContractNo),
      title: c.Title,
      client: c.Client,
      projectCode: c.ProjectCode,
      value: Number(c.ContractValue) || 0,
      contractDate: c.ContractDate,
      completionDate: c.CompletionDate,
      documentType: c.DocumentType,
      documentUrl: doc.url,
      documentUrlSafe: doc.safe,
      raw: rawFields(c, schema.columns.Contracts)
    };
  }).sort(function (a, b) { return b.value - a.value; });

  var STATE_RANK = { overdue: 0, 'due-soon': 1, undated: 2, upcoming: 3, done: 4 };
  var taxes = taxesRaw === null ? null : taxesRaw.map(function (t) {
    return {
      taxId: String(t.TaxID),
      taxType: t.TaxType,
      period: String(t.Period),
      amount: t.Amount === '' ? null : Number(t.Amount),
      payDueDate: t.PayDueDate,
      paidDate: t.PaidDate,
      reportDueDate: t.ReportDueDate,
      reportedDate: t.ReportedDate,
      billingCode: t.BillingCode,
      ntpn: t.NTPN,
      statusOverride: t.Status,
      status: taxStatus(t, now),
      raw: rawFields(t, schema.columns.Taxes)
    };
  }).sort(function (a, b) {
    return (STATE_RANK[a.status.state] - STATE_RANK[b.status.state]) ||
      ((a.status.daysLeft === null ? 9999 : a.status.daysLeft) - (b.status.daysLeft === null ? 9999 : b.status.daysLeft)) ||
      String(b.period).localeCompare(String(a.period));
  });

  return { revenue: revenue, invoices: invoices, contracts: contracts, taxes: taxes };
}

var LogicExports = {
  jakartaDayStamp: jakartaDayStamp,
  jakartaCalendarParts: jakartaCalendarParts,
  dateOnlyStamp: dateOnlyStamp,
  daysUntil: daysUntil,
  daysSince: daysSince,
  monthKeyOf: monthKeyOf,
  yearOf: yearOf,
  jakartaWeekday: jakartaWeekday,
  isDigestDay: isDigestDay,
  parseWarnDays: parseWarnDays,
  evidenceStatus: evidenceStatus,
  certificateReminderKind: certificateReminderKind,
  TENDER_STAGES: TENDER_STAGES,
  TENDER_TERMINAL: TENDER_TERMINAL,
  tenderStagesDue: tenderStagesDue,
  nextTenderStage: nextTenderStage,
  isRecentAddendum: isRecentAddendum,
  isStaleProject: isStaleProject,
  escapeHtml: escapeHtml,
  isSafeUrl: isSafeUrl,
  SAFE_URL_HOSTS: SAFE_URL_HOSTS,
  isAllowedRecipient: isAllowedRecipient,
  filterRecipients: filterRecipients,
  isValidProjectCode: isValidProjectCode,
  isValidTenderId: isValidTenderId,
  nextProjectCode: nextProjectCode,
  nextTenderId: nextTenderId,
  sanitizeForSheet: sanitizeForSheet,
  buildOperationsDigest: buildOperationsDigest,
  buildFinanceDigest: buildFinanceDigest,
  computeOpsFacts: computeOpsFacts,
  computeFinanceFacts: computeFinanceFacts,
  sheetSerialToString: sheetSerialToString,
  sheetValuesToRecords: sheetValuesToRecords,
  IMPORT_DATE_FIELDS: IMPORT_DATE_FIELDS,
  isStrictIsoDate: isStrictIsoDate,
  validateImportRow: validateImportRow,
  importKeys: importKeys,
  importKey: importKey,
  readStaleUpdateDays: readStaleUpdateDays,
  resolveUrl: resolveUrl,
  buildDashboardPayload: buildDashboardPayload,
  planDelete: planDelete,
  planDeleteLogEntry: planDeleteLogEntry,
  parseAttachments: parseAttachments,
  formatAttachments: formatAttachments,
  validateLogEntry: validateLogEntry,
  buildFinanceDetail: buildFinanceDetail,
  rawFields: rawFields,
  TAX_MONTHLY_TYPES: TAX_MONTHLY_TYPES,
  TAX_ANNUAL_TYPE: TAX_ANNUAL_TYPE,
  taxDueDates: taxDueDates,
  taxId: taxId,
  taxRowsToAdd: taxRowsToAdd,
  taxStatus: taxStatus,
  computeRevenue: computeRevenue,
  isoToSheetSerial: isoToSheetSerial,
  instantToSheetSerial: instantToSheetSerial,
  jakartaToday: jakartaToday,
  EDIT_TARGETS: EDIT_TARGETS,
  validateEdit: validateEdit,
  lastUsedRowIndex: lastUsedRowIndex,
  toCellValue: toCellValue,
  planEdit: planEdit
};

if (typeof module !== 'undefined') {
  module.exports = LogicExports;
}
