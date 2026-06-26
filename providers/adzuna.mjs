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
