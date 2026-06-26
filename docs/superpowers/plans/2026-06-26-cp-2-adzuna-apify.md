# CP-2 Adzuna + Apify Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Adzuna and Apify LinkedIn Jobs source adapters to the CP-1 provider framework so the zero-token scanner pulls UK contract supply from two more channels.

**Architecture:** Two drop-in `providers/*.mjs` modules (board-style, no `detect()`), wired via `job_boards:` entries. Adzuna maps convenience fields like Reed; Apify POSTs a raw passthrough `input` to the actor's `run-sync-get-dataset-items` REST endpoint and is disabled-by-default (paid). No `scan.mjs` change.

**Tech Stack:** Node ESM (`.mjs`), `providers/_http.mjs` ctx (`fetchJson` supports POST/body/timeout), plain assertion test files mirroring `test-reed-adapter.mjs`.

---

### Task 1: Adzuna adapter

**Files:**
- Create: `providers/adzuna.mjs`
- Test: `test-adzuna-adapter.mjs`

- [ ] **Step 1: Write the failing test** — `test-adzuna-adapter.mjs`

```js
#!/usr/bin/env node
// @ts-check
// Run: node test-adzuna-adapter.mjs
import { buildSearchUrl, parseAdzunaDate, mapAdzunaJob } from './providers/adzuna.mjs';

let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}
function section(name) { console.log(`\n━━━ ${name} ━━━`); }

await (async () => {

section('buildSearchUrl');
{
  const u = new URL(buildSearchUrl({
    keywords: '"AI Engineer" OR LLM', locationName: 'London',
    distanceFromLocation: 30, contract: true, resultsToTake: 50,
    country: 'gb', page: 2,
  }, { appId: 'ID', appKey: 'KEY' }));
  assert(u.origin + u.pathname === 'https://api.adzuna.com/v1/api/jobs/gb/search/2', 'hits country/page endpoint');
  assert(u.searchParams.get('app_id') === 'ID' && u.searchParams.get('app_key') === 'KEY', 'passes credentials');
  assert(u.searchParams.get('what') === '"AI Engineer" OR LLM', 'maps keywords to what');
  assert(u.searchParams.get('where') === 'London', 'maps locationName to where');
  assert(u.searchParams.get('distance') === '30', 'maps distance (km)');
  assert(u.searchParams.get('contract') === '1', 'sets contract=1 when entry.contract');
  assert(u.searchParams.get('results_per_page') === '50', 'maps resultsToTake');
}
{
  const u = new URL(buildSearchUrl({ keywords: 'data' }, { appId: 'I', appKey: 'K' }));
  assert(u.origin + u.pathname === 'https://api.adzuna.com/v1/api/jobs/gb/search/1', 'defaults country gb, page 1');
  assert(u.searchParams.get('results_per_page') === '50', 'defaults results_per_page to 50');
  assert(!u.searchParams.has('contract'), 'omits contract when unset');
  assert(!u.searchParams.has('where'), 'omits where when unset');
  assert(!u.searchParams.has('distance'), 'omits distance when unset');
}

section('parseAdzunaDate');
assert(parseAdzunaDate('2026-06-01T00:00:00Z') === Date.parse('2026-06-01T00:00:00Z'), 'parses ISO 8601');
assert(parseAdzunaDate('') === undefined, 'empty → undefined');
assert(parseAdzunaDate('garbage') === undefined, 'garbage → undefined');
assert(parseAdzunaDate(12345) === undefined, 'non-string → undefined');

section('mapAdzunaJob');
{
  const raw = {
    title: 'AI Engineer (Contract)',
    company: { display_name: 'Acme AI' },
    location: { display_name: 'London, UK' },
    redirect_url: 'https://www.adzuna.co.uk/jobs/details/123',
    salary_min: 500, salary_max: 650, contract_type: 'contract',
    created: '2026-06-01T09:00:00Z', description: 'Build LLM agents…',
  };
  const job = mapAdzunaJob(raw, { name: 'Adzuna', country: 'gb' });
  assert(job.title === 'AI Engineer (Contract)', 'maps title');
  assert(job.url === 'https://www.adzuna.co.uk/jobs/details/123', 'maps redirect_url to url');
  assert(job.company === 'Acme AI', 'maps company.display_name');
  assert(job.location === 'London, UK', 'maps location.display_name');
  assert(job.salary.min === 500 && job.salary.max === 650 && job.salary.currency === 'GBP', 'maps salary, GBP for gb');
  assert(job.contractType === 'contract', 'maps contract_type');
  assert(typeof job.compRaw === 'string' && job.compRaw.includes('500'), 'builds compRaw');
  assert(job.postedAt === Date.parse('2026-06-01T09:00:00Z'), 'parses created');
  assert(job.description === 'Build LLM agents…', 'carries description for content_filter');
}
{
  const raw = { title: 'ML Eng', redirect_url: 'https://x/y', company: {}, location: {} };
  const job = mapAdzunaJob(raw, { name: 'Adzuna Fallback' });
  assert(job.company === 'Adzuna Fallback', 'falls back to entry.name when no company');
  assert(job.salary === undefined, 'no salary block when no bounds');
  assert(job.contractType === undefined, 'no contractType when source omits it');
}

section('fetch (stubbed ctx)');
{
  process.env.ADZUNA_APP_ID = 'ID'; process.env.ADZUNA_APP_KEY = 'KEY';
  const { default: adzuna } = await import('./providers/adzuna.mjs');
  let calledUrl = '';
  const ctx = { transport: 'http', async fetchJson(url) {
    calledUrl = url;
    return { results: [
      { title: 'AI Eng', redirect_url: 'https://a/1', company: { display_name: 'Co' }, location: { display_name: 'London' } },
      { title: '', redirect_url: 'https://a/2' },            // dropped: no title
      { title: 'No URL', redirect_url: 'ftp://nope' },        // dropped: non-http
    ] };
  } };
  const jobs = await adzuna.fetch({ name: 'Adzuna', keywords: 'AI', contract: true }, ctx);
  assert(calledUrl.includes('api.adzuna.com'), 'fetch hits adzuna endpoint');
  assert(jobs.length === 1 && jobs[0].title === 'AI Eng', 'filters out untitled/non-http rows');
}
{
  delete process.env.ADZUNA_APP_ID;
  const { default: adzuna } = await import('./providers/adzuna.mjs');
  let threw = false;
  try { await adzuna.fetch({ name: 'Adzuna' }, { async fetchJson() { return {}; } }); }
  catch { threw = true; }
  assert(threw, 'throws clean skip when ADZUNA_APP_ID missing');
}

console.log(`\n${'─'.repeat(40)}\nAdzuna adapter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
```

- [ ] **Step 2: Run, verify it fails** — `node test-adzuna-adapter.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement `providers/adzuna.mjs`**

```js
// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Adzuna provider — free UK job aggregator (https://developer.adzuna.com).
// Board-style: no detect(), wired via a `job_boards:` entry with provider: adzuna.
// Auth is two query params, ADZUNA_APP_ID + ADZUNA_APP_KEY. Zero-token: HTTP + JSON,
// single page (Adzuna caps results_per_page at 50). Pagination is out of scope (CP-2).

const BASE = 'https://api.adzuna.com/v1/api/jobs';

const COUNTRY_CURRENCY = { gb: 'GBP', us: 'USD', ca: 'CAD', au: 'AUD', de: 'EUR', fr: 'EUR', nl: 'EUR', ie: 'EUR' };

/** @param {Record<string, any>} entry @param {{appId:string, appKey:string}} creds @returns {string} */
export function buildSearchUrl(entry, creds) {
  const country = (entry.country || 'gb').toString().toLowerCase();
  const page = entry.page != null ? String(entry.page) : '1';
  const url = new URL(`${BASE}/${country}/search/${page}`);
  const p = url.searchParams;
  p.set('app_id', creds.appId);
  p.set('app_key', creds.appKey);
  if (entry.keywords) p.set('what', String(entry.keywords));
  if (entry.locationName) p.set('where', String(entry.locationName));
  if (entry.distanceFromLocation != null) p.set('distance', String(entry.distanceFromLocation));
  if (entry.contract === true) p.set('contract', '1');
  p.set('results_per_page', String(entry.resultsToTake ?? 50));
  return url.toString();
}

// Adzuna returns `created` as ISO 8601. Return epoch ms or undefined.
/** @param {unknown} str @returns {number|undefined} */
export function parseAdzunaDate(str) {
  if (typeof str !== 'string' || !str.trim()) return undefined;
  const ms = Date.parse(str);
  return Number.isFinite(ms) ? ms : undefined;
}

/** @param {Record<string, any>} raw @param {Record<string, any>} entry @returns {import('./_types.js').Job} */
export function mapAdzunaJob(raw, entry) {
  const url = typeof raw.redirect_url === 'string' ? raw.redirect_url.trim() : '';
  const country = (entry.country || 'gb').toString().toLowerCase();
  const currency = COUNTRY_CURRENCY[country];

  const min = Number.isFinite(raw.salary_min) ? raw.salary_min : undefined;
  const max = Number.isFinite(raw.salary_max) ? raw.salary_max : undefined;
  const salary = (min != null || max != null) ? { min, max, currency } : undefined;
  const compRaw = salary
    ? `${currency ?? ''}${min ?? ''}${(min != null && max != null) ? ' - ' : ''}${max ?? ''}`.trim() || undefined
    : undefined;

  const job = {
    title: typeof raw.title === 'string' ? raw.title.trim() : '',
    url,
    company: (raw.company && typeof raw.company.display_name === 'string' && raw.company.display_name.trim())
      ? raw.company.display_name.trim()
      : (entry.name || 'Adzuna'),
    location: (raw.location && typeof raw.location.display_name === 'string') ? raw.location.display_name.trim() : '',
  };
  if (salary) job.salary = salary;
  if (compRaw) job.compRaw = compRaw;
  if (raw.contract_type === 'contract' || raw.contract_type === 'permanent') job.contractType = raw.contract_type;
  const postedAt = parseAdzunaDate(raw.created);
  if (postedAt != null) job.postedAt = postedAt;
  if (typeof raw.description === 'string' && raw.description.trim()) job.description = raw.description.trim();
  return job;
}

/** @type {Provider} */
export default {
  id: 'adzuna',
  /**
   * @param {import('./_types.js').PortalEntry & Record<string, unknown>} entry
   * @param {import('./_types.js').Context} ctx
   * @returns {Promise<import('./_types.js').Job[]>}
   */
  async fetch(entry, ctx) {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appId.trim() || !appKey || !appKey.trim()) {
      throw new Error('adzuna: ADZUNA_APP_ID/ADZUNA_APP_KEY not set — add them to .env (see .env.example). Skipping Adzuna source.');
    }
    const url = buildSearchUrl(entry, { appId: appId.trim(), appKey: appKey.trim() });
    const json = /** @type {any} */ (await ctx.fetchJson(url, { redirect: 'error' }));
    const results = Array.isArray(json?.results) ? json.results : [];
    return results
      .map(/** @param {Record<string, any>} raw */ (raw) => mapAdzunaJob(raw, entry))
      .filter(/** @param {import('./_types.js').Job} job */ (job) => job.title && /^https?:\/\//i.test(job.url));
  },
};
```

- [ ] **Step 4: Run, verify pass** — `node test-adzuna-adapter.mjs` → all pass.

- [ ] **Step 5: Commit**

```bash
git add providers/adzuna.mjs test-adzuna-adapter.mjs
git commit -m "feat(adzuna): add Adzuna UK aggregator adapter (TDD)"
```

---

### Task 2: Apify LinkedIn Jobs adapter

**Files:**
- Create: `providers/apify.mjs`
- Test: `test-apify-adapter.mjs`

- [ ] **Step 1: Write the failing test** — `test-apify-adapter.mjs`

```js
#!/usr/bin/env node
// @ts-check
// Run: node test-apify-adapter.mjs
import { normalizeActor, buildRunUrl, mapApifyJob } from './providers/apify.mjs';

let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ FAIL: ${name}`); }
}
function section(name) { console.log(`\n━━━ ${name} ━━━`); }

await (async () => {

section('normalizeActor');
assert(normalizeActor('chronometrica/linkedin-jobs-scraper') === 'chronometrica~linkedin-jobs-scraper', 'slash → tilde');
assert(normalizeActor('chronometrica~linkedin-jobs-scraper') === 'chronometrica~linkedin-jobs-scraper', 'tilde unchanged');
assert(normalizeActor('  user/actor  ') === 'user~actor', 'trims');

section('buildRunUrl');
{
  const u = new URL(buildRunUrl('user~actor', 'TOK', {}));
  assert(u.origin + u.pathname === 'https://api.apify.com/v2/acts/user~actor/run-sync-get-dataset-items', 'sync dataset-items endpoint');
  assert(u.searchParams.get('token') === 'TOK', 'passes token');
  assert(!u.searchParams.has('maxItems'), 'omits maxItems when unset');
}
{
  const u = new URL(buildRunUrl('user~actor', 'TOK', { maxItems: 50 }));
  assert(u.searchParams.get('maxItems') === '50', 'sets maxItems when given');
}

section('mapApifyJob');
{
  const raw = {
    title: 'LLM Engineer', companyName: 'NeuralCo', location: 'Remote, UK',
    jobUrl: 'https://www.linkedin.com/jobs/view/123', description: 'Agentic systems…',
    workplaceType: 'Remote', employmentType: 'Contract', salary: '£600/day',
    postedAt: '2026-06-10T00:00:00Z',
  };
  const job = mapApifyJob(raw, { name: 'Apify LinkedIn' });
  assert(job.title === 'LLM Engineer', 'maps title');
  assert(job.url === 'https://www.linkedin.com/jobs/view/123', 'maps jobUrl');
  assert(job.company === 'NeuralCo', 'maps companyName');
  assert(job.location === 'Remote, UK', 'maps location');
  assert(job.description === 'Agentic systems…', 'maps description');
  assert(job.remoteType === 'remote', 'normalizes workplaceType to remote');
  assert(job.contractType === 'contract', 'derives contract from employmentType');
  assert(job.compRaw === '£600/day', 'maps salary string to compRaw');
  assert(job.postedAt === Date.parse('2026-06-10T00:00:00Z'), 'parses postedAt ISO');
}
{
  const raw = { title: 'Eng', link: 'https://x/y', company: 'Alt', publishedAt: 1750000000000 };
  const job = mapApifyJob(raw, { name: 'Apify', contract: true });
  assert(job.url === 'https://x/y', 'falls back to link for url');
  assert(job.company === 'Alt', 'falls back to company field');
  assert(job.contractType === 'contract', 'derives contract from entry.contract');
  assert(job.postedAt === 1750000000000, 'accepts epoch ms postedAt');
}

section('fetch — disabled-by-default gate');
{
  const { default: apify } = await import('./providers/apify.mjs');
  const ctx = { transport: 'http', async fetchJson() { throw new Error('should not be called'); } };
  const a = await apify.fetch({ name: 'Apify' }, ctx);                  // enabled omitted
  assert(Array.isArray(a) && a.length === 0, 'returns [] when enabled omitted (no spend)');
  const b = await apify.fetch({ name: 'Apify', enabled: false }, ctx);  // explicit false
  assert(Array.isArray(b) && b.length === 0, 'returns [] when enabled:false');
}

section('fetch — enabled');
{
  process.env.APIFY_TOKEN = 'TOK';
  const { default: apify } = await import('./providers/apify.mjs');
  let opts = null, calledUrl = '';
  const ctx = { transport: 'http', async fetchJson(url, o) {
    calledUrl = url; opts = o;
    return [
      { title: 'LLM Eng', jobUrl: 'https://l/1', companyName: 'Co' },
      { title: '', jobUrl: 'https://l/2' },     // dropped
    ];
  } };
  const jobs = await apify.fetch(
    { name: 'Apify', enabled: true, actor: 'user/actor', input: { rows: 25 }, maxItems: 25 }, ctx);
  assert(calledUrl.includes('/acts/user~actor/run-sync-get-dataset-items'), 'POSTs to normalized actor endpoint');
  assert(opts.method === 'POST' && opts.body === JSON.stringify({ rows: 25 }), 'POSTs raw input passthrough');
  assert(opts.redirect === 'error', 'uses redirect:error');
  assert(jobs.length === 1 && jobs[0].title === 'LLM Eng', 'filters untitled rows');
}
{
  delete process.env.APIFY_TOKEN;
  const { default: apify } = await import('./providers/apify.mjs');
  let threw = false;
  try { await apify.fetch({ name: 'Apify', enabled: true, actor: 'user/actor' }, { async fetchJson() { return []; } }); }
  catch { threw = true; }
  assert(threw, 'throws clean skip when APIFY_TOKEN missing and source is enabled');
}
{
  process.env.APIFY_TOKEN = 'TOK';
  const { default: apify } = await import('./providers/apify.mjs');
  let threw = false;
  try { await apify.fetch({ name: 'Apify', enabled: true }, { async fetchJson() { return []; } }); }
  catch { threw = true; }
  assert(threw, 'throws when actor missing');
  delete process.env.APIFY_TOKEN;
}

console.log(`\n${'─'.repeat(40)}\nApify adapter: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
})();
```

- [ ] **Step 2: Run, verify it fails** — `node test-apify-adapter.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement `providers/apify.mjs`**

```js
// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Apify provider — LinkedIn Jobs via Apify's run-sync-get-dataset-items REST API
// (https://docs.apify.com). The scrape runs on Apify's infrastructure; we send no
// browser and no LinkedIn credentials. PAID (~$1.50/1,000 saved jobs), so this source
// is DISABLED BY DEFAULT: it runs only on an explicit `enabled: true` in the entry.
// Input is raw passthrough — the entry's `input:` object is POSTed to the actor as-is,
// keeping the provider actor-agnostic. Auth is APIFY_TOKEN.

const API_BASE = 'https://api.apify.com/v2/acts';
const DEFAULT_TIMEOUT_MS = 120_000; // a synchronous actor run can take a minute+

/** Normalize a `user/actor` slug to the REST `user~actor` form. @param {string} actor @returns {string} */
export function normalizeActor(actor) {
  return String(actor).trim().replace(/\//g, '~');
}

/** @param {string} actor @param {string} token @param {{maxItems?: number}} opts @returns {string} */
export function buildRunUrl(actor, token, { maxItems } = {}) {
  const url = new URL(`${API_BASE}/${actor}/run-sync-get-dataset-items`);
  url.searchParams.set('token', token);
  if (maxItems != null) url.searchParams.set('maxItems', String(maxItems));
  return url.toString();
}

/** @param {unknown} v @returns {number|undefined} */
function toEpochMs(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return ms;
  }
  return undefined;
}

/** @param {unknown} v @returns {('remote'|'hybrid'|'onsite'|undefined)} */
function normalizeRemote(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  if (s.includes('remote')) return 'remote';
  if (s.includes('hybrid')) return 'hybrid';
  if (s.includes('on-site') || s.includes('onsite') || s.includes('on site')) return 'onsite';
  return undefined;
}

/** @param {Record<string, any>} raw @param {Record<string, any>} entry @returns {import('./_types.js').Job} */
export function mapApifyJob(raw, entry) {
  const url = [raw.jobUrl, raw.link, raw.url].find(u => typeof u === 'string' && u.trim()) || '';
  const job = {
    title: typeof raw.title === 'string' ? raw.title.trim() : '',
    url: typeof url === 'string' ? url.trim() : '',
    company: [raw.companyName, raw.company].find(c => typeof c === 'string' && c.trim()) || (entry.name || 'Apify'),
    location: typeof raw.location === 'string' ? raw.location.trim() : '',
  };
  const desc = [raw.description, raw.descriptionText].find(d => typeof d === 'string' && d.trim());
  if (desc) job.description = desc.trim();
  const remoteType = normalizeRemote(raw.workplaceType);
  if (remoteType) job.remoteType = remoteType;
  const isContract = entry.contract === true || (typeof raw.employmentType === 'string' && /contract/i.test(raw.employmentType));
  if (isContract) job.contractType = 'contract';
  const comp = [raw.salary, raw.salaryInfo].find(s => typeof s === 'string' && s.trim());
  if (comp) job.compRaw = comp.trim();
  const postedAt = toEpochMs(raw.postedAt ?? raw.publishedAt);
  if (postedAt != null) job.postedAt = postedAt;
  return job;
}

/** @type {Provider} */
export default {
  id: 'apify',
  /**
   * @param {import('./_types.js').PortalEntry & Record<string, any>} entry
   * @param {import('./_types.js').Context} ctx
   * @returns {Promise<import('./_types.js').Job[]>}
   */
  async fetch(entry, ctx) {
    // Disabled-by-default: only an explicit enabled:true runs this paid source.
    if (entry.enabled !== true) return [];

    const token = process.env.APIFY_TOKEN;
    if (!token || !token.trim()) {
      throw new Error('apify: APIFY_TOKEN not set — add it to .env (see .env.example). Skipping Apify source.');
    }
    if (!entry.actor || !String(entry.actor).trim()) {
      throw new Error('apify: entry is missing `actor` (e.g. chronometrica/linkedin-jobs-scraper). Skipping Apify source.');
    }
    const actor = normalizeActor(entry.actor);
    const maxItems = Number.isFinite(entry.maxItems) ? entry.maxItems : undefined;
    const url = buildRunUrl(actor, token.trim(), { maxItems });
    const input = (entry.input && typeof entry.input === 'object') ? entry.input : {};
    const res = /** @type {any} */ (await ctx.fetchJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      redirect: 'error',
      timeoutMs: Number.isFinite(entry.timeoutMs) ? entry.timeoutMs : DEFAULT_TIMEOUT_MS,
    }));
    const items = Array.isArray(res) ? res : [];
    return items
      .map(/** @param {Record<string, any>} raw */ (raw) => mapApifyJob(raw, entry))
      .filter(/** @param {import('./_types.js').Job} job */ (job) => job.title && /^https?:\/\//i.test(job.url));
  },
};
```

- [ ] **Step 4: Run, verify pass** — `node test-apify-adapter.mjs` → all pass.

- [ ] **Step 5: Commit**

```bash
git add providers/apify.mjs test-apify-adapter.mjs
git commit -m "feat(apify): add Apify LinkedIn Jobs adapter, disabled-by-default (TDD)"
```

---

### Task 3: Config + docs (.env.example, portals.example.yml, SCRIPTS.md)

**Files:**
- Modify: `.env.example` (append after the Reed block)
- Modify: `templates/portals.example.yml` (under the `job_boards:` block, after the Reed entry)
- Modify: `docs/SCRIPTS.md` (Apify cost note)

- [ ] **Step 1:** Append to `.env.example` after the Reed block:

```
# ── Adzuna API (CP-2: contract discovery) ────────────────────────────────────
# Required for: the Adzuna job_boards source in portals.yml (provider: adzuna)
# Free keys: https://developer.adzuna.com (register an app → App ID + App Key)
# Without these the Adzuna source is skipped with a clear message; the rest of
# the scan runs normally.
ADZUNA_APP_ID=your_adzuna_app_id_here
ADZUNA_APP_KEY=your_adzuna_app_key_here

# ── Apify token (CP-2: LinkedIn Jobs via Apify) ──────────────────────────────
# Required for: the Apify job_boards source (provider: apify), which scrapes
# LinkedIn Jobs on Apify's infrastructure — no browser, no LinkedIn login here.
# PAID (~$1.50/1,000 saved jobs). The Apify source is DISABLED BY DEFAULT and runs
# only when an entry sets `enabled: true`. Token: https://console.apify.com → Settings → Integrations.
APIFY_TOKEN=your_apify_token_here
```

- [ ] **Step 2:** In `templates/portals.example.yml`, after the commented Reed entry (before the SolidJobs block), insert:

```yaml
  # ── Adzuna (UK contract discovery — CP-2) ──────────────────────────
  # Free UK aggregator. Requires ADZUNA_APP_ID + ADZUNA_APP_KEY in .env
  # (free: https://developer.adzuna.com). Without them this source is
  # skipped cleanly. Keyword precision is CP-9; remote/contract
  # post-filtering is CP-3 — this entry only fetches and tags supply.
  # - name: Adzuna (UK AI contract)
  #   provider: adzuna
  #   enabled: true
  #   keywords: '"AI Engineer" OR "LLM" OR "agentic" OR "machine learning"'
  #   locationName: London          # any UK town/city/postcode
  #   distanceFromLocation: 30       # km from locationName (Adzuna uses km)
  #   contract: true                 # Adzuna contract filter + tags contractType
  #   resultsToTake: 50              # Adzuna page cap (optional, default 50)
  #   country: gb                    # optional, default gb

  # ── Apify LinkedIn Jobs (CP-2) — PAID, DISABLED BY DEFAULT ──────────
  # Scrapes LinkedIn Jobs on Apify's infrastructure (no browser, no LinkedIn
  # login here). Requires APIFY_TOKEN in .env. Cost ~$1.50/1,000 saved jobs.
  # Runs ONLY when enabled: true — leave it false/absent to never spend.
  # `input` is passed to the actor verbatim; cap volume with the actor's own
  # rows/count field (here `rows`) and optionally `maxItems`. See docs/SCRIPTS.md.
  # - name: Apify LinkedIn (UK AI contract)
  #   provider: apify
  #   enabled: false                 # set true to run — PAID
  #   actor: chronometrica/linkedin-jobs-scraper
  #   maxItems: 50                   # secondary cap on returned items
  #   input:
  #     title: "AI Engineer"
  #     location: "United Kingdom"
  #     contractType: "Contract"
  #     workType: "Remote"
  #     rows: 50                     # actor-specific volume cap (controls spend)
```

- [ ] **Step 3:** In `docs/SCRIPTS.md`, add an Apify cost subsection (find the scanner/providers area; if there's a "Job boards / providers" section append there, else add near the `scan.mjs` entry):

```markdown
### Apify (LinkedIn Jobs) — cost behaviour

The `apify` provider (CP-2) scrapes LinkedIn Jobs through Apify's
`run-sync-get-dataset-items` REST API. The scrape runs on Apify's servers — no
browser and no LinkedIn credentials on our side — and returns JSON.

- **Paid.** ~$1.50 per 1,000 saved jobs (Apify usage, not Claude tokens).
- **Disabled by default.** The source runs only when its `job_boards` entry sets
  `enabled: true`. Omitted or `false` → the provider returns nothing and spends $0.
- **Capping volume.** The entry's `input:` object is sent to the actor verbatim;
  cap spend with the actor's own volume field (e.g. `rows`/`count`). `maxItems` on
  the entry is a secondary trim of items returned to the scanner.
- **Auth.** `APIFY_TOKEN` in `.env`. Missing token on an enabled entry → the source
  is skipped with a clear message; the rest of the scan runs.
```

- [ ] **Step 4: Validate portals example still parses** — `node validate-portals.mjs --file templates/portals.example.yml` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add .env.example templates/portals.example.yml docs/SCRIPTS.md
git commit -m "docs(contract-pipeline): document Adzuna + Apify keys, portals entries, Apify cost"
```

---

### Task 4: Register adapter tests in the suite + verify green

**Files:**
- Modify: `test-all.mjs` (the `scripts` array, ~line 146-167)

- [ ] **Step 1:** Add three entries to the `scripts` array in `test-all.mjs` (after `tracker-columns-tests.mjs`):

```js
  { name: 'test-reed-adapter.mjs', expectExit: 0 },
  { name: 'test-adzuna-adapter.mjs', expectExit: 0 },
  { name: 'test-apify-adapter.mjs', expectExit: 0 },
```

- [ ] **Step 2: Run the full suite** — `node test-all.mjs --quick`
Expected: PASS (the only known local failure is the pre-existing `.claude` global-gitignore skill-materialization false-negative — ignore it; the three new adapter tests must pass).

- [ ] **Step 3: Dry-run sanity** — confirm the scanner loads both providers cleanly:

Run: `node scan.mjs --dry-run 2>&1 | head -20`
Expected: no provider-load error mentioning adzuna/apify; "Scanning … via providers" prints. (User-layer `portals.yml` may not reference them — loading without error is the check here.)

- [ ] **Step 4: Commit**

```bash
git add test-all.mjs
git commit -m "test(contract-pipeline): register reed/adzuna/apify adapter tests in test-all"
```

- [ ] **Step 5: Update the CP-2 ticket** — mark DoD boxes and set status to Built (mirror how CP-1 was closed in its ticket), then commit:

```bash
git add docs/proposals/contract-pipeline/CP-2-adzuna-apify-adapters.md
git commit -m "docs(contract-pipeline): mark CP-2 built, check off DoD"
```

---

## Self-Review

- **Spec coverage:** Adzuna adapter (Task 1) ✓; Apify REST adapter no-browser/no-creds (Task 2) ✓; disabled-by-default gate (Task 2 test + impl) ✓; three keys in `.env.example` + clean skip (Tasks 1/2/3) ✓; Apify cost in `docs/SCRIPTS.md` (Task 3) ✓; `test-all.mjs` passes + dry-run tagged by source (Task 4) ✓.
- **Placeholder scan:** none — all code is concrete.
- **Type consistency:** `buildSearchUrl(entry, creds)`, `mapAdzunaJob(raw, entry)`, `parseAdzunaDate`, `normalizeActor`, `buildRunUrl(actor, token, opts)`, `mapApifyJob(raw, entry)` are used identically in tests and impl. Job shape matches `_types.js` (`salary`, `contractType`, `remoteType`, `compRaw`, `postedAt`, `description`).
