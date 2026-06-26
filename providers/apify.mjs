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
  // Location field name varies by actor: generic `location`, or the
  // chronometrica/linkedin-jobs-scraper `locationRaw`/`locationCity`.
  const location = [raw.location, raw.locationRaw, raw.locationCity].find(l => typeof l === 'string' && l.trim()) || '';
  const job = {
    title: typeof raw.title === 'string' ? raw.title.trim() : '',
    url: typeof url === 'string' ? url.trim() : '',
    company: [raw.companyName, raw.company].find(c => typeof c === 'string' && c.trim()) || (entry.name || 'Apify'),
    location: typeof location === 'string' ? location.trim() : '',
  };
  const desc = [raw.description, raw.descriptionText].find(d => typeof d === 'string' && d.trim());
  if (desc) job.description = desc.trim();
  const remoteType = normalizeRemote(raw.workplaceType);
  if (remoteType) job.remoteType = remoteType;
  const isContract = entry.contract === true || (typeof raw.employmentType === 'string' && /contract/i.test(raw.employmentType));
  if (isContract) job.contractType = 'contract';
  // Structured comp when the actor exposes it (chronometrica: salaryMin/Max/Currency).
  const sMin = Number.isFinite(raw.salaryMin) ? raw.salaryMin : undefined;
  const sMax = Number.isFinite(raw.salaryMax) ? raw.salaryMax : undefined;
  const sCur = (typeof raw.salaryCurrency === 'string' && raw.salaryCurrency.trim()) ? raw.salaryCurrency.trim() : undefined;
  if (sMin != null || sMax != null) job.salary = { min: sMin, max: sMax, currency: sCur };
  // Human-readable comp string: prefer the actor's raw field (salaryRaw on chronometrica).
  const comp = [raw.salaryRaw, raw.salary, raw.salaryInfo].find(s => typeof s === 'string' && s.trim());
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
