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
/** @param {Record<string, any>} entry @returns {string} */
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
/** @param {unknown} str @returns {number|undefined} */
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
/** @param {Record<string, any>} raw @param {Record<string, any>} entry @returns {import('./_types.js').Job} */
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
      .map(/** @param {Record<string, any>} raw */ (raw) => mapReedJob(raw, entry))
      .filter(/** @param {import('./_types.js').Job} job */ (job) => job.title && /^https?:\/\//i.test(job.url));
  },
};
