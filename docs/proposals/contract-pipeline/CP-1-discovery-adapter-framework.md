# CP-1: Discovery adapter framework + Reed source

**Status:** Planned · **Phase:** 1 · **Depends on:** — · **Effort:** M

## Overview

To pull UK AI/agentic **contract** roles we need a source beyond company ATS
boards. Reed — the UK's largest job board — exposes contract gigs that
Greenhouse/Ashby/Lever never list. This ticket adds **Reed as the first
keyword-search source**, plus the small offer-shape and secrets plumbing that
later discovery tickets (CP-2, CP-3, CP-9) build on.

### Reality check — the framework already exists

The original ticket was framed as "refactor `detectApi()` and `PARSERS` into a
source-adapter interface." **That refactor is already done.** As of v1.13.0,
`scan.mjs` loads `providers/*.mjs` at startup; each provider is a default export
`{ id, detect?, fetch }` and query-based aggregators (`remotive`, `remoteok`,
`workingnomads`) already plug in through a `job_boards:` entry with
`provider: <id>`. So CP-1 is **purely additive** — no framework rewrite.

What actually remains:

1. A `providers/reed.mjs` adapter (board-style, `fetch` only, no `detect`).
2. Extend the normalized `Job` shape with optional contract fields
   (`contractType`, `remoteType`, `compRaw`) — additive, existing providers
   untouched.
3. Load `.env` in `scan.mjs` so Reed can read `REED_API_KEY` (dotenv is already
   a dependency but `scan.mjs` does not import it today).
4. Document `REED_API_KEY` in `.env.example` and a Reed `job_boards:` example in
   `templates/portals.example.yml`.

### Config decision (resolved)

Reed wires in as a **`job_boards:` entry**, not a new `sources:` block. This
matches the existing aggregator convention (`remotive`/`remoteok`), keeps query
params in the user layer, and avoids a parallel config mechanism. The ticket's
original "`sources:`" wording is treated as descriptive, not literal.

```yaml
# portals.yml (user layer)
job_boards:
  - name: Reed (UK AI contract)
    provider: reed
    enabled: true
    keywords: '"AI Engineer" OR "LLM" OR "agentic"'
    locationName: London
    distanceFromLocation: 30   # miles
    contract: true             # Reed contract filter + tags offers contractType:'contract'
    resultsToTake: 100         # Reed page cap; optional, default 100
```

### Data contract

All Reed query params live in `portals.yml` (user layer). The secret lives in
`.env` (user layer). All mechanism — the adapter, the offer-shape extension, the
dotenv import — lives in the system layer (`providers/`, `scan.mjs`, `_types.js`,
`.env.example`, `templates/`). Updates never touch user tuning. See
`DATA_CONTRACT.md`.

### Scope boundaries

- **Zero-token.** Pure HTTP + JSON, no LLM call, single page (≤100 results). Reed
  pagination (`resultsToSkip`) is deferred — note it in code, don't build it.
- **No filtering on the new fields here.** Remote/contract/location post-filtering
  is **CP-3**; keyword-match precision is **CP-9**. CP-1 only *populates* the
  fields. Existing `title_filter`/`location_filter`/`salary_filter` still apply
  to Reed rows via the shared `scan.mjs` pipeline (the adapter maps Reed salary
  into the existing `job.salary` shape so `salary_filter` keeps working).

## Definition of Done

- [ ] `providers/reed.mjs` fetches contract roles by keyword + UK location and
      returns the extended offer shape; `provider: reed` validates via
      `validate-portals.mjs` automatically.
- [ ] `scan.mjs` loads `.env`; missing `REED_API_KEY` skips Reed with a clear
      message (the per-provider try/catch records it as an error, no crash).
- [ ] `REED_API_KEY` documented in `.env.example`; Reed example in
      `templates/portals.example.yml`.
- [ ] Existing Greenhouse/Ashby/Lever behaviour unchanged.
- [ ] `node test-reed-adapter.mjs` passes; `node test-all.mjs` passes.

---

# Discovery Adapter (Reed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a zero-token Reed jobseeker-API adapter to the existing
`scan.mjs` provider framework, surfacing UK AI/agentic contract roles via a
`job_boards:` entry.

**Architecture:** Reed is a board-style provider (`fetch` only, no URL
auto-detection). Pure helper functions (param building, response mapping, Reed
date parsing) are exported for unit testing; the `fetch` method composes them
over the shared HTTP context with HTTP Basic auth. `scan.mjs` gains a one-line
dotenv import so the adapter can read `REED_API_KEY`. The normalized `Job` shape
gains optional contract fields that existing providers simply leave unset.

**Tech Stack:** Node.js ESM (`.mjs`), `dotenv` (already a dependency),
`js-yaml`, the project's `assert()`-style standalone test files run via `node`.

---

### Task 1: Load `.env` in `scan.mjs` and document `REED_API_KEY`

**Files:**
- Modify: `scan.mjs` (top-of-file imports, around line 33-38)
- Modify: `.env.example`

- [ ] **Step 1: Add the dotenv import to `scan.mjs`**

At the top of `scan.mjs`, immediately after the shebang/header comment block and
before the existing `import { readFileSync... }` line, add:

```js
import 'dotenv/config';
```

Rationale: `dotenv` is already in `package.json` dependencies and used by
`gemini-eval.mjs`. `import 'dotenv/config'` populates `process.env` from `.env`
at startup with no further wiring. It is a no-op when `.env` is absent, so the
existing zero-config ATS scan path is unaffected.

- [ ] **Step 2: Document the key in `.env.example`**

Append this block to the end of `.env.example`:

```bash
# ── Reed jobseeker API (CP-1: contract discovery) ────────────────────────────
# Required for: the Reed job_boards source in portals.yml (provider: reed)
# Free API key: https://www.reed.co.uk/developers (register, then "Get API key")
# Auth is HTTP Basic — the key is the username, password is blank.
# Without this key the Reed source is skipped with a clear message; the rest of
# the scan runs normally.
REED_API_KEY=your_reed_api_key_here
```

- [ ] **Step 3: Verify scan still runs without a Reed source configured**

Run: `node scan.mjs --dry-run --company __none__`
Expected: completes with a normal summary (0 companies matched), no dotenv error,
exit code 0.

- [ ] **Step 4: Commit**

```bash
git add scan.mjs .env.example
git commit -m "feat(scan): load .env so providers can read secrets; document REED_API_KEY"
```

---

### Task 2: Extend the normalized `Job` typedef

**Files:**
- Modify: `providers/_types.js` (the `Job` typedef, lines 12-33)

- [ ] **Step 1: Add the contract fields to the `Job` typedef**

In `providers/_types.js`, inside the `Job` typedef block, add these properties
after the existing `postedAt` property (keep all existing properties):

```js
 * @property {object} [salary]  Structured comp, consumed by scan.mjs's
 *                              salary_filter. Shape: { min?: number,
 *                              max?: number, currency?: string }. Ashby and Reed
 *                              populate it; most providers omit it.
 * @property {('contract'|'permanent'|'temp')} [contractType]
 *                              Engagement type when the source exposes it.
 *                              Reed sets it from the query's `contract` flag.
 *                              Filtering on it is CP-3, not the scanner core.
 * @property {('remote'|'hybrid'|'onsite')} [remoteType]
 *                              Work arrangement when known. Reed has no direct
 *                              remote flag (CP-3 derives it); left unset here.
 * @property {string} [compRaw] The source's raw, unparsed comp string (e.g.
 *                              "£500 - £650 per day"). Preserved for CP-7
 *                              evaluation; never parsed by the scanner core.
```

These are additive and optional — existing providers that don't set them are
unaffected, and `scan.mjs` only reads `salary` (already in use via Ashby).

- [ ] **Step 2: Verify the type file still imports cleanly**

Run: `node -e "import('./providers/_types.js').then(() => console.log('ok'))"`
Expected: prints `ok` (the file is JSDoc-only; this just confirms no syntax error).

- [ ] **Step 3: Commit**

```bash
git add providers/_types.js
git commit -m "feat(providers): document contract fields on the Job shape (contractType, remoteType, compRaw, salary)"
```

---

### Task 3: Reed adapter — pure helpers (TDD)

**Files:**
- Create: `providers/reed.mjs`
- Create: `test-reed-adapter.mjs`

The adapter exports three pure helpers so the wire logic is testable without a
network call: `buildSearchUrl(entry)`, `parseReedDate(str)`, and
`mapReedJob(rawJob, entry)`.

- [ ] **Step 1: Write the failing test file**

Create `test-reed-adapter.mjs`:

```js
#!/usr/bin/env node
// @ts-check
// Run: node test-reed-adapter.mjs
import { buildSearchUrl, parseReedDate, mapReedJob } from './providers/reed.mjs';

let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}
function section(name) { console.log(`\n━━━ ${name} ━━━`); }

section('buildSearchUrl');
{
  const u = new URL(buildSearchUrl({
    keywords: '"AI Engineer" OR LLM', locationName: 'London',
    distanceFromLocation: 30, contract: true, resultsToTake: 50,
  }));
  assert(u.origin + u.pathname === 'https://www.reed.co.uk/api/1.0/search', 'hits the search endpoint');
  assert(u.searchParams.get('keywords') === '"AI Engineer" OR LLM', 'passes keywords verbatim');
  assert(u.searchParams.get('locationName') === 'London', 'passes locationName');
  assert(u.searchParams.get('distanceFromLocation') === '30', 'passes distance');
  assert(u.searchParams.get('contract') === 'true', 'passes contract flag');
  assert(u.searchParams.get('resultsToTake') === '50', 'passes resultsToTake');
}
{
  const u = new URL(buildSearchUrl({ keywords: 'data' }));
  assert(u.searchParams.get('resultsToTake') === '100', 'defaults resultsToTake to 100');
  assert(!u.searchParams.has('contract'), 'omits contract when unset');
  assert(!u.searchParams.has('locationName'), 'omits locationName when unset');
}

section('parseReedDate');
assert(parseReedDate('25/12/2026') === Date.UTC(2026, 11, 25), 'parses DD/MM/YYYY');
assert(parseReedDate('') === undefined, 'empty string → undefined');
assert(parseReedDate('not-a-date') === undefined, 'garbage → undefined');
assert(parseReedDate('31/02/2026') === undefined, 'invalid calendar date → undefined');

section('mapReedJob');
{
  const raw = {
    jobId: 54321, jobTitle: 'AI Engineer (Contract)', employerName: 'Acme AI',
    locationName: 'London', minimumSalary: 500, maximumSalary: 650,
    currency: 'GBP', date: '01/06/2026', jobUrl: 'https://www.reed.co.uk/jobs/ai-engineer/54321',
  };
  const job = mapReedJob(raw, { name: 'Reed', contract: true });
  assert(job.title === 'AI Engineer (Contract)', 'maps title');
  assert(job.url === 'https://www.reed.co.uk/jobs/ai-engineer/54321', 'uses jobUrl when present');
  assert(job.company === 'Acme AI', 'maps employerName to company');
  assert(job.location === 'London', 'maps locationName');
  assert(job.salary.min === 500 && job.salary.max === 650 && job.salary.currency === 'GBP', 'maps salary shape');
  assert(job.contractType === 'contract', 'derives contractType from entry.contract');
  assert(typeof job.compRaw === 'string' && job.compRaw.includes('500'), 'builds compRaw from salary');
  assert(job.postedAt === Date.UTC(2026, 5, 1), 'parses posted date');
}
{
  const raw = { jobId: 9, jobTitle: 'ML Eng', employerName: '', locationName: '' };
  const job = mapReedJob(raw, { name: 'Reed Fallback' });
  assert(job.url === 'https://www.reed.co.uk/jobs/9', 'falls back to constructed URL when jobUrl missing');
  assert(job.company === 'Reed Fallback', 'falls back to entry.name when employerName empty');
  assert(job.contractType === undefined, 'no contractType when entry.contract unset');
  assert(job.salary === undefined, 'no salary object when Reed returns no salary numbers');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test-reed-adapter.mjs`
Expected: FAIL — `Cannot find module './providers/reed.mjs'` (or named-export
errors once the file is stubbed).

- [ ] **Step 3: Implement `providers/reed.mjs` helpers**

Create `providers/reed.mjs` (the `fetch` method is added in Task 4 — for now,
ship the helpers and a stub default export so the import resolves):

```js
// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Reed provider — UK jobseeker API (https://www.reed.co.uk/developers).
// Board-style source: no detect(), wired via a `job_boards:` entry with
// `provider: reed`. Auth is HTTP Basic — REED_API_KEY as username, blank
// password. Zero-token: pure HTTP + JSON, single page (≤100 results).
//
// Reed search params we map from the job_boards entry: keywords, locationName,
// distanceFromLocation (miles), contract (boolean), resultsToTake (≤100).
// Pagination (resultsToSkip) is intentionally out of scope for CP-1.

const SEARCH_ENDPOINT = 'https://www.reed.co.uk/api/1.0/search';

// Build the Reed search URL from a job_boards entry. Only forwards params the
// entry actually sets, so a bare { keywords } query stays minimal. resultsToTake
// defaults to Reed's page cap of 100.
export function buildSearchUrl(entry) {
  const url = new URL(SEARCH_ENDPOINT);
  const p = url.searchParams;
  if (entry.keywords) p.set('keywords', String(entry.keywords));
  if (entry.locationName) p.set('locationName', String(entry.locationName));
  if (entry.distanceFromLocation != null) p.set('distanceFromLocation', String(entry.distanceFromLocation));
  if (entry.contract === true) p.set('contract', 'true');
  p.set('resultsToTake', String(entry.resultsToTake ?? 100));
  return url.toString();
}

// Reed returns posted dates as DD/MM/YYYY. Return epoch ms (UTC midnight) or
// undefined for empty/malformed/invalid-calendar input. The round-trip check
// rejects overflow dates like 31/02 that Date.UTC would silently roll forward.
export function parseReedDate(str) {
  if (typeof str !== 'string') return undefined;
  const m = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return undefined;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return undefined;
  }
  return ms;
}

// Map one raw Reed search result to the normalized Job shape. Salary is mapped
// into the existing job.salary shape so scan.mjs's salary_filter keeps working.
// contractType is derived from the query's contract flag (Reed's per-job payload
// doesn't echo engagement type). compRaw preserves a human-readable comp string
// for CP-7. The caller filters out untitled / non-http rows.
export function mapReedJob(raw, entry) {
  const jobId = raw.jobId;
  const url = (typeof raw.jobUrl === 'string' && /^https?:\/\//i.test(raw.jobUrl))
    ? raw.jobUrl.trim()
    : `https://www.reed.co.uk/jobs/${jobId}`;

  const min = Number.isFinite(raw.minimumSalary) ? raw.minimumSalary : undefined;
  const max = Number.isFinite(raw.maximumSalary) ? raw.maximumSalary : undefined;
  const currency = typeof raw.currency === 'string' && raw.currency.trim() ? raw.currency.trim() : undefined;
  const salary = (min != null || max != null) ? { min, max, currency } : undefined;

  const compRaw = salary
    ? `${currency ?? ''}${min ?? ''}${(min != null && max != null) ? ' - ' : ''}${max ?? ''}`.trim() || undefined
    : undefined;

  const job = {
    title: typeof raw.jobTitle === 'string' ? raw.jobTitle.trim() : '',
    url,
    company: (typeof raw.employerName === 'string' && raw.employerName.trim())
      ? raw.employerName.trim()
      : (entry.name || 'Reed'),
    location: typeof raw.locationName === 'string' ? raw.locationName.trim() : '',
  };
  if (salary) job.salary = salary;
  if (compRaw) job.compRaw = compRaw;
  if (entry.contract === true) job.contractType = 'contract';
  const postedAt = parseReedDate(raw.date);
  if (postedAt != null) job.postedAt = postedAt;
  return job;
}

/** @type {Provider} */
export default {
  id: 'reed',
  // fetch is implemented in Task 4.
  async fetch() {
    throw new Error('reed: fetch not implemented yet');
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test-reed-adapter.mjs`
Expected: `... passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add providers/reed.mjs test-reed-adapter.mjs
git commit -m "feat(reed): pure helpers for Reed URL/date/job mapping (TDD)"
```

---

### Task 4: Reed adapter — `fetch` with HTTP Basic auth

**Files:**
- Modify: `providers/reed.mjs` (the default export's `fetch`)
- Modify: `test-reed-adapter.mjs` (add a fetch test with a stubbed ctx)

- [ ] **Step 1: Add the failing fetch test**

Append to `test-reed-adapter.mjs`, before the final `console.log` summary line.
Wrap the file's top-level code in an `async` IIFE if needed, or simply replace
the final summary block so the awaited fetch tests run before it. The added
block:

```js
section('fetch — uses ctx, auth header, maps results');
{
  process.env.REED_API_KEY = 'testkey';
  const calls = [];
  const ctx = {
    transport: 'http',
    fetchText: async () => '',
    fetchJson: async (url, opts) => {
      calls.push({ url, opts });
      return { results: [
        { jobId: 1, jobTitle: 'AI Engineer', employerName: 'Acme', locationName: 'London',
          minimumSalary: 500, maximumSalary: 650, currency: 'GBP', date: '01/06/2026',
          jobUrl: 'https://www.reed.co.uk/jobs/ai/1' },
        { jobId: 2, jobTitle: '', employerName: 'NoTitle', locationName: 'Leeds' }, // dropped: no title
      ] };
    },
  };
  const reed = (await import('./providers/reed.mjs')).default;
  const jobs = await reed.fetch({ name: 'Reed', keywords: 'AI', contract: true }, ctx);
  assert(calls.length === 1, 'calls fetchJson once');
  assert(calls[0].url.startsWith('https://www.reed.co.uk/api/1.0/search'), 'hits search endpoint');
  const auth = calls[0].opts.headers.Authorization;
  assert(auth === 'Basic ' + Buffer.from('testkey:').toString('base64'), 'sends HTTP Basic auth (key as user, blank pw)');
  assert(calls[0].opts.redirect === 'error', 'uses redirect:error (SSRF guard)');
  assert(jobs.length === 1, 'drops untitled rows');
  assert(jobs[0].title === 'AI Engineer' && jobs[0].contractType === 'contract', 'maps + tags the kept row');
}
{
  delete process.env.REED_API_KEY;
  const reed = (await import('./providers/reed.mjs')).default;
  let threw = false;
  try { await reed.fetch({ name: 'Reed' }, { fetchJson: async () => ({}) }); }
  catch (e) { threw = /REED_API_KEY/.test(e.message); }
  assert(threw, 'throws a clear REED_API_KEY error when the key is missing');
}
```

Because this block uses top-level `await`, ensure the whole test body runs inside
an `async` IIFE (`(async () => { ... })()`) or rely on ESM top-level await (this
project's `.mjs` files support it). The simplest edit: wrap the entire test body
from the first `section(...)` through `process.exit(...)` in
`await (async () => { ... })();`. ESM modules permit top-level await, so a bare
`await import(...)` at module scope also works.

- [ ] **Step 2: Run the test to verify the new cases fail**

Run: `node test-reed-adapter.mjs`
Expected: FAIL on the fetch section — current stub throws `fetch not implemented yet`.

- [ ] **Step 3: Implement `fetch`**

Replace the stub default export in `providers/reed.mjs` with:

```js
/** @type {Provider} */
export default {
  id: 'reed',

  /**
   * Fetch UK contract roles from the Reed jobseeker API.
   * @param {import('./_types.js').PortalEntry & Record<string, unknown>} entry
   * @param {import('./_types.js').Context} ctx
   * @returns {Promise<import('./_types.js').Job[]>}
   */
  async fetch(entry, ctx) {
    const key = process.env.REED_API_KEY;
    if (!key || !key.trim()) {
      throw new Error('reed: REED_API_KEY not set — add it to .env (see .env.example). Skipping Reed source.');
    }
    const auth = 'Basic ' + Buffer.from(`${key.trim()}:`).toString('base64');
    const url = buildSearchUrl(entry);
    // redirect:'error' prevents SSRF via server-side redirects.
    const json = /** @type {any} */ (await ctx.fetchJson(url, {
      headers: { Authorization: auth },
      redirect: 'error',
    }));
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .map((raw) => mapReedJob(raw, entry))
      .filter((job) => job.title && /^https?:\/\//i.test(job.url));
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test-reed-adapter.mjs`
Expected: `... passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add providers/reed.mjs test-reed-adapter.mjs
git commit -m "feat(reed): fetch contract roles via Reed API with HTTP Basic auth"
```

---

### Task 5: Document the Reed source in the portals template

**Files:**
- Modify: `templates/portals.example.yml`

- [ ] **Step 1: Add a commented Reed example under `job_boards:`**

Find the `job_boards:` block in `templates/portals.example.yml` (the same block
that documents `remotive`/`remoteok`). Add this commented entry alongside the
existing examples:

```yaml
  # Reed — UK's largest job board; the contract-role source (CP-1).
  # Requires REED_API_KEY in .env (free: https://www.reed.co.uk/developers).
  # - name: Reed (UK AI contract)
  #   provider: reed
  #   enabled: true
  #   keywords: '"AI Engineer" OR "LLM" OR "agentic" OR "machine learning"'
  #   locationName: London          # any UK town/city/postcode
  #   distanceFromLocation: 30       # miles from locationName
  #   contract: true                 # Reed contract filter + tags offers contractType:'contract'
  #   resultsToTake: 100             # Reed page cap (optional, default 100)
```

If `templates/portals.example.yml` has no `job_boards:` block, add one with this
single commented entry. Do **not** touch the user's live `portals.yml` — that is
their layer.

- [ ] **Step 2: Verify the template still parses as YAML**

Run: `node -e "import('js-yaml').then(y => { import('fs').then(fs => { y.default.load(fs.readFileSync('templates/portals.example.yml','utf8')); console.log('ok'); }); })"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add templates/portals.example.yml
git commit -m "docs(portals): document Reed job_boards source in the example template"
```

---

### Task 6: Full regression — `test-all.mjs`

**Files:** none (verification only, unless Step 1 surfaces a provider enumeration)

- [ ] **Step 1: Run the full suite**

Run: `node test-all.mjs`
Expected: all checks pass (including provider-loading checks — `reed.mjs` loads
as a valid `{ id, fetch }` provider). If the suite has a provider-count or
provider-list assertion that enumerates expected ids, update it to include
`reed` and re-run.

- [ ] **Step 2: Smoke-test a live dry run (optional, needs a real key)**

With a real `REED_API_KEY` in `.env` and the Reed entry uncommented in
`portals.yml`:

Run: `node scan.mjs --dry-run --company Reed`
Expected: lists Reed results with `reed-api` as the source tag; no files written.

- [ ] **Step 3: Final commit (only if Step 1 required a test update)**

```bash
git add test-all.mjs
git commit -m "test: include reed in provider expectations"
```

---

## Self-review notes

- **Spec coverage:** DoD items map to Tasks 3-4 (adapter), Task 1 (.env +
  example), Task 5 (template), Task 6 (`test-all`). The "framework already
  exists" finding removes the original refactor scope.
- **Type consistency:** helper names (`buildSearchUrl`, `parseReedDate`,
  `mapReedJob`) and the `Job` fields (`salary`, `contractType`, `compRaw`,
  `postedAt`) are used identically across `_types.js`, `reed.mjs`, and tests.
- **Deferred (not in CP-1):** Reed pagination, remote/contract post-filtering
  (CP-3), keyword-match precision (CP-9), Adzuna/Apify adapters (CP-2).
