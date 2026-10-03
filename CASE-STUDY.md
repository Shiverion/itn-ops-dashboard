# Case study: ITN Ops — an AI-assisted operations platform for an Indonesian EPC contractor

**Role:** sole designer and engineer (product, architecture, security, implementation, deployment)
**Timeline:** 2–3 October 2026 (two days from first commit to production)
**Stack:** React 19 · TypeScript · Tailwind CSS 4 · Node.js · Google Cloud Run · Cloud Scheduler · Secret Manager · Google Workspace APIs (Sheets, Drive, Gmail, Calendar) · Cloudflare Workers · Claude (Sonnet 5.5 / Opus 5.5) · GPT Luna
**Live at:** `ops.itnconstruction.com` (company-internal; Google sign-in restricted to the company domain)

> Written in the STAR format: **S**ituation → **T**ask → **A**ction → **R**esult. Every number below was measured on the running system or taken from its records.

---

## S — Situation

PT Internasional Teknik Nusantara (ITN) is a small Indonesian EPC and construction contractor that runs two to three projects every six months, mostly as a subcontractor and supplier on large energy and infrastructure jobs (a refinery expansion, a toll road, an airport, a jetty).

The company's knowledge and money lived in places that didn't talk to each other:

- **One shared mailbox** held two years of client correspondence, tender invitations, purchase orders and tax notices.
- **Google Drive** held signed contracts, certificates and tender files, many of them **scanned PDFs** that no one could search.
- **Spreadsheets** tracked projects and invoices by hand, with no view of revenue, money owed or tax deadlines.
- **The tender experience list** — the document that decides whether ITN can even bid — listed 17 contracts worth **over Rp 13 billion**, but **most of them had no date**, so revenue could not be placed in a year.
- **Indonesian monthly tax obligations** (PPN, PPh 4(2), 21, 23, 25 and the annual corporate return) were tracked in nobody's system, with real penalties for a missed date.

The constraints were just as real: no IT team, a small budget, an owner who works from a phone as often as a laptop, and data that must stay confidential — client tender documents, personal data in emails, and finance figures.

## T — Task

Deliver **one place to run the business from**, on the company's own domain:

1. **Revenue first** — invoiced, collected, owed and backlog at a glance, plus the history of contracts won.
2. **Project status as a living log** — each project a timeline of meetings, negotiations, site visits and milestones, with files attached.
3. **Everything editable** from the dashboard, safely, without anyone touching a spreadsheet.
4. **Tax deadlines that can't be missed**, with alerts before every due date.
5. **An AI advisor** that knows the company's history and can answer "what's the best next move on this project?"
6. **Running cost close to zero**, working from a phone with the owner's PC switched off.
7. **Secure by design** — the AI and the cloud must never see more than the person asking is allowed to see.

## A — Action

### 1. Right-sized the architecture before writing code
I first drafted a conventional cloud architecture (managed database, identity-aware proxy, separate sync jobs) and **rejected it** as too heavy for a company of ITN's size. Instead I kept **Google Sheets as the system of record** — the team already trusts and understands it — and put **serverless compute** around it. That one decision kept the running cost near zero and meant no data migration and no new database to secure. Every decision of this kind is recorded with its reasoning.

### 2. Turned two years of mailbox and Drive into a cited knowledge base
I built an extraction pipeline that reads the shared mailbox, Drive and Calendar for the last two years and turns them into knowledge notes the AI can use:

- **Filters before any AI sees anything:** messages marked confidential are skipped (after stripping email disclaimer footers, so the footer itself doesn't trigger the filter), attachments are excluded, and security notices are dropped.
- **Personal-data redaction** with unit tests: national ID numbers, tax IDs, bank accounts, phone numbers in Indonesian and international formats, one-time codes, birth dates and home addresses.
- **737 sources → 437 cited facts → 10 notes**, each statement carrying a permanent source ID, so every claim can be traced back to the email or file it came from.
- **A second model reviewed the notes three times** and caught real problems (wrong facts, a finance figure leaking into a team note, dates lost during consolidation), which I fixed before publishing.
- When a redaction gap was found (one ID format and some foreign phone numbers had slipped through), I **fixed the filter, added tests, disclosed it, and purged every raw copy**.

### 3. Moved the automation off the owner's PC to serverless — at no extra cost
The first version ran on the owner's PC; the owner asked to update from a phone with the PC off. I moved it to **Google Cloud Run** (a scheduled job plus a small refresh service), with:

- **Keyless, read-only access** to the mailbox through domain-wide delegation — no key files exist anywhere.
- **AI on the owner's existing Claude subscription** through Claude Code in headless mode, instead of a pay-per-token API. I estimated the API route at about US$5–20 a month; the delivered setup adds **about US$0**, because everything else fits Google Cloud's free tier.
- A **one-command cutover** that uninstalls the PC tasks first, so the PC and the cloud can never both edit the notes.

### 4. Put the dashboard on the company's own domain, with security the platform enforces
The dashboard is a **React 19 + TypeScript** single-page app served by a small **Node.js** service on Cloud Run, reached at `ops.itnconstruction.com` through a **Cloudflare Worker** (Cloud Run custom domains aren't available in the Jakarta region).

- **Sign-in with Google**, accepted only for verified company accounts, checked on every request.
- **Reads and edits happen *as the signed-in person*** through domain-wide delegation limited to Sheets. Google's own file sharing therefore still decides who sees the Finance sections and who may edit — the server never grants more access than the person already has.
- **Every edit goes through one pure, tested planner:** only whitelisted fields per record type, type and date validation, duplicate detection, and writes that can never be interpreted as spreadsheet formulas. Formula columns are never touched.
- **Every change and deletion is written to an owner-only audit log**, including the full contents of a deleted row, so nothing is lost by mistake.
- **A hash-pinned Content Security Policy**: the page runs only its own script and Google's sign-in, and cannot be framed.

### 5. Built the "main dashboard" the owner asked for
- **Revenue first:** invoiced this year vs the same point last year, cash collected, money owed with an overdue amount and aging buckets, contract backlog, a month-by-month chart, contract value won by year, and billed-vs-built progress per project.
- **Tax tracker** for PPN, PPh 4(2), 21, 23, 25 and the annual return: rows for each period are **created automatically every day**, due dates are filled in from the rules, and the owner is **alerted by a banner and by email 7, 3 and 1 days before** each deadline and daily once overdue. Recording a payment (billing code, NTPN) or a filed report clears the alert.
- **Separate pages** (Overview, Revenue, Projects, Tenders, Certificates, Taxes, Contracts, Ask ITN) with phone-friendly navigation and working Back buttons.

### 6. Recovered the company's revenue history from scanned documents
- Imported the **work-experience register (17 contracts, over Rp 13 billion)** from the tender experience PDF, each linked to its signed source document, through the same validation as dashboard edits.
- **Used a vision model to read the 12 undated scanned purchase orders**, recovering every missing contract date with the exact line it came from, and the **scope of work** for all 17 (what was supplied, quantities, location, period).

### 7. Made the AI useful and safe
- **Project activity log:** every project has a timeline of entries (1st meeting, 2nd meeting, negotiation, quotation, contract, mobilization…) with photos, PDFs and Office files attached. Files go to a **dedicated shared drive** that is the only place the service account can write.
- **AI drafts the entry from the uploaded files** — minutes of meeting, photos, Word, Excel — and the person confirms before anything is saved. The same flow fills in a certificate from its scan.
- **AI advisor** on every project page and across the business ("Ask ITN"): it answers from the records the person can see, the knowledge notes and the project's recent attachments, and says which entry each point comes from.
- **No tools, no actions:** the model is run with every tool disabled and files passed in as content, so a malicious document can only ever be *read* — it cannot make the AI open files, browse or change anything. Answers are rendered as plain text with a small Markdown subset, never as HTML.
- **Fast enough to use:** a first version made the owner wait about a minute in silence. I measured where the time went (the model, not the file upload), switched the advisor to a faster model and **streamed the answer end to end**, so it appears as it is written; on a short test question the first words arrived after 3.5 seconds.

### 8. Engineered for trust
- **89 automated tests** (83 on the shared business logic, 6 on the server), run before every deploy; every deploy is committed and tagged.
- The first version was built through a **builder-and-reviewer loop**: one AI model wrote code, a second reviewed it read-only, across three rounds, until the reviewer had nothing left to flag.
- Throughout, I worked as the architect and reviewer with AI coding agents (Claude Code, Codex) doing much of the typing — deciding what to build, checking every change, and owning the security model.

## R — Result

| Outcome | Before | After |
|---|---|---|
| Where the business is run from | Mailbox, Drive and hand-kept spreadsheets | **One dashboard** on `ops.itnconstruction.com`, desktop and phone |
| Contract history with dates | 5 of 17 contracts dated | **17 of 17 dated**, every contract placed in its year |
| Scope of past work | Locked in scanned PDFs | **Scope, items, location and period** recorded for all 17 contracts |
| Company knowledge for AI | Unsearchable mailbox and scans | **737 sources → 437 cited facts → 10 reviewed notes**, refreshed daily |
| Tax deadlines | Not tracked | **6 tax types tracked**, periods created automatically, alerts at 7/3/1 days and overdue |
| Updates when the owner's PC is off | Not possible | **Daily automatic refresh + a refresh button that works from a phone** |
| Added running cost | — | **About US$0 / month** (existing Workspace and Claude subscriptions; Google Cloud free tier) |
| AI advisor wait | ~60 s with no feedback | **Streamed answer** that appears as it is written (3.5 s to first words on a short test question) |
| Quality gates | — | **89 automated tests**, audit log on every change, platform-enforced permissions |

**Delivered in two days**, from an empty repository to a production system on the company's own domain.

### What I'd highlight
- **Right-sizing is a feature.** Choosing the spreadsheet the team already trusts as the database, and serverless around it, removed a whole class of cost and risk.
- **Let the platform enforce permissions.** Acting as the signed-in person means the dashboard can never leak what Google Drive sharing wouldn't — a stronger guarantee than any permission check I could write myself.
- **Treat documents as untrusted input.** Running the AI with no tools turns prompt injection from a security problem into, at worst, a wrong answer that a person reviews.
- **Measure before optimising.** The slow advisor turned out to be the model, not the upload; streaming fixed the experience more than any infrastructure change would have.
