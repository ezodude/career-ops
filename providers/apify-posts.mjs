// @ts-check
// Apify LinkedIn *posts* normaliser — warm-signal discovery (CP-8). A post is a
// poster + text, NOT a Job; this is a separate module from providers/apify.mjs.

/** Parse a UK day rate from free text, always normalised to "£<amount>/day" (e.g. "£600 per day" → "£600/day", "£450–500/day" → "£450–500/day"). @param {string} text @returns {string|undefined} */
export function parseDayRate(text) {
  if (typeof text !== 'string') return undefined;
  const m = text.match(/(?<!\d)£?\s?(\d{1,4}(?:,\d{3})*(?:\s?[–-]\s?£?\s?\d{1,4}(?:,\d{3})*)?)\s?(?:\/|per\s?)\s?day\b/i);
  if (!m) return undefined;
  // Normalise the captured amount (strip stray whitespace) and re-attach a canonical "/day".
  return `£${m[1].replace(/\s+/g, '')}/day`;
}

/** A LinkedIn *Page* (brand/company/aggregator) shows a bare follower count where a person shows a job title. @param {string} headline @returns {boolean} */
export function isPageProfile(headline) {
  return typeof headline === 'string' && /^\s*[\d,]+\s+followers?\s*$/i.test(headline);
}

/** Detect IR35 status from free text. @param {string} text @returns {('outside'|'inside'|undefined)} */
export function parseIr35(text) {
  if (typeof text !== 'string') return undefined;
  if (/outside\s+ir35/i.test(text)) return 'outside';
  if (/inside\s+ir35/i.test(text)) return 'inside';
  return undefined;
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

/** Strip the ?utm… query string; preserve the full path including the trailing LinkedIn activity code. @param {string} u @returns {string} */
function cleanPostUrl(u) {
  if (typeof u !== 'string') return '';
  const q = u.indexOf('?');
  return (q === -1 ? u : u.slice(0, q)).trim();
}

/** Dig the reaction count out of the actor's nested reactions object (or scalar). @param {unknown} r @returns {number|undefined} */
function reactionCount(r) {
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  if (r && typeof r === 'object') {
    const o = /** @type {any} */ (r);
    const n = Number.isFinite(o.total_reactions) ? o.total_reactions : o.total;
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

const API_BASE = 'https://api.apify.com/v2/acts';

/** Normalise `user/actor` → `user~actor`. @param {string} actor @returns {string} */
export function normalizeActor(actor) { return String(actor).trim().replace(/\//g, '~'); }

/**
 * PAID: run the posts-search actor for one keyword and return raw dataset items.
 * Not unit-tested (spends money). Caller must have obtained a spend-go.
 * @param {string} actor @param {string} keyword
 * @param {{token:string, limit?:number, fetchJson:Function, timeoutMs?:number}} opts
 * @returns {Promise<Record<string, any>[]>}
 */
export async function fetchPosts(actor, keyword, { token, limit = 30, fetchJson, timeoutMs = 120_000 }) {
  const url = new URL(`${API_BASE}/${normalizeActor(actor)}/run-sync-get-dataset-items`);
  url.searchParams.set('token', token);
  const input = { keyword, sort_type: 'date_posted', date_filter: 'past-week', limit };
  const res = await fetchJson(url.toString(), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input), redirect: 'error', timeoutMs,
  });
  return Array.isArray(res) ? res : [];
}

/** NFKC-normalise so styled unicode (bold/italic math letters) collapses to ASCII before regex. @param {unknown} s @returns {string} */
function nfkc(s) { return typeof s === 'string' ? s.normalize('NFKC') : ''; }

/**
 * Normalise one raw Apify posts-search item into a warm-post record.
 * `posterType` is left undefined here — the classify stage (warm-scan.mjs) sets it.
 * @param {Record<string, any>} raw
 * @returns {{poster:{name:string,headline:string,url:string,followers:(number|undefined)},posterType:undefined,text:string,dayRate:(string|undefined),ir35:('outside'|'inside'|undefined),location:string,url:string,postedAt:(number|undefined),reactions:(number|undefined)}}
 */
export function mapApifyPost(raw) {
  if (!raw || typeof raw !== 'object') raw = {};
  const a = (raw && typeof raw.author === 'object' && raw.author) ? raw.author : {};
  const text = nfkc(typeof raw.text === 'string' ? raw.text : '');
  return {
    poster: {
      name: typeof a.name === 'string' ? a.name.trim() : '',
      headline: nfkc(a.headline).trim(),
      url: typeof a.profile_url === 'string' ? a.profile_url.trim() : '',
      followers: Number.isFinite(a.followers) ? a.followers : undefined,
    },
    posterType: undefined,
    text,
    dayRate: parseDayRate(text),
    ir35: parseIr35(text),
    location: nfkc(a.location).trim(),
    url: cleanPostUrl(raw.post_url ?? raw.url),
    postedAt: toEpochMs(raw.posted_at?.timestamp ?? raw.posted_at ?? raw.postedAt),
    reactions: reactionCount(raw.stats ?? raw.reactions),
  };
}
