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

await (async () => {

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

})();
