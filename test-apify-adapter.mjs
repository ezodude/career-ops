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
