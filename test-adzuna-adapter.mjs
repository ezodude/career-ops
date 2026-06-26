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
