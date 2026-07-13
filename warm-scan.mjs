#!/usr/bin/env node
// @ts-check
// warm-scan.mjs — standalone, opt-in, PAID warm-signal discovery (CP-8).
// Default run = zero-spend dry preview. Actual Apify fetch only on `--spend`.
// Reuses scan.mjs pure helpers; writes data/warm-leads.md (never touches pipeline.md).

import { pathToFileURL as _p } from 'url';
import { readFileSync as _read, writeFileSync as _write, existsSync as _exists } from 'fs';
import { makeHttpCtx } from './providers/_http.mjs';
import yaml from 'js-yaml';
import { makeGeminiClassifier, mergeHiringVerdicts, HIRING_INTENT_DEFAULT_MODEL } from './hiring-intent.mjs';

const { compileKeyword, buildLocationFilter } = await import(_p(process.cwd() + '/scan.mjs').href);
const { mapApifyPost, fetchPosts, isPageProfile } = await import(_p(process.cwd() + '/providers/apify-posts.mjs').href);

/** True when post text matches any job-seeker signal (wrong direction — drop). @param {string} text @param {string[]} signals @returns {boolean} */
export function isJobSeeker(text, signals) {
  if (typeof text !== 'string' || !Array.isArray(signals)) return false;
  const lower = text.toLowerCase();
  return signals.some(s => typeof s === 'string' && s && lower.includes(s.toLowerCase()));
}

/** Classify a poster by name: an aggregator repost page vs an individual human. @param {string} name @param {string[]} aggregatorPages @returns {('human'|'aggregator')} */
export function classifyPosterType(name, aggregatorPages) {
  if (typeof name !== 'string' || !name.trim() || !Array.isArray(aggregatorPages)) return 'human';
  const lower = name.toLowerCase();
  const matchers = aggregatorPages
    .filter(k => typeof k === 'string' && k.length > 0)
    .map(k => compileKeyword(k.toLowerCase()));
  return matchers.some(m => m(lower)) ? 'aggregator' : 'human';
}

/** Triage tags for a warm-leads row: poster-type + region + optional IR35/day-rate. Emits NO [contract?] tag. @param {{posterType?:string,location?:string,text?:string,ir35?:string,dayRate?:string,extraTags?:string[]}} record @returns {string} */
export function buildWarmTags(record) {
  const tags = [record?.posterType === 'aggregator' ? '[aggregator]' : '[warm]'];
  const loc = (record?.location || record?.text || '').toLowerCase();
  if (/\bremote\b/.test(loc)) tags.push('[remote]');
  else if (/\b(uk|united kingdom|london|england|scotland|wales)\b/.test(loc)) tags.push('[UK]');
  if (record?.ir35 === 'outside') tags.push('[outside IR35]');
  else if (record?.ir35 === 'inside') tags.push('[inside IR35]');
  if (record?.dayRate) tags.push(String(record.dayRate).replace(/\|/g, '/').replace(/[\r\n]/g, ' '));
  if (Array.isArray(record?.extraTags)) tags.push(...record.extraTags.filter(t => typeof t === 'string' && t));
  return tags.join(' ');
}

/**
 * Pure discovery pipeline → categorised warm records. Order (first veto wins):
 * NFKC (done in mapApifyPost) → URL dedup → job-seeker drop → region gate → near-dup dedup →
 * Page→aggregator → pattern→aggregator → economics→humans → else→ambiguous.
 * @param {Record<string, any>[]} rawItems
 * @param {{location_filter?:object, aggregator_pages?:string[], jobseeker_signals?:string[]}} config
 * @returns {{humans:object[], aggregators:object[], ambiguous:object[]}}
 */
export function runWarmChain(rawItems, config) {
  const passesRegion = buildLocationFilter(config?.location_filter);
  const seekerSignals = Array.isArray(config?.jobseeker_signals) ? config.jobseeker_signals : [];
  const aggPages = Array.isArray(config?.aggregator_pages) ? config.aggregator_pages : [];
  const seenUrl = new Set();
  const seenSig = new Set();
  const humans = [];
  const aggregators = [];
  const ambiguous = [];
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const rec = mapApifyPost(raw);
    if (!rec.url || seenUrl.has(rec.url)) continue;            // URL dedup
    if (isJobSeeker(rec.text, seekerSignals)) continue;       // wrong direction
    const region = `${rec.location} ${rec.text}`.trim();       // combined region gate: block-term anywhere → veto; else an allow-word in text can rescue a non-blocked location
    if (!passesRegion(region)) continue;
    const sig = dupeSignature(rec);                            // near-dup dedup
    if (sig && seenSig.has(sig)) continue;
    seenUrl.add(rec.url);
    if (sig) seenSig.add(sig);
    if (isPageProfile(rec.poster?.headline ?? '')) {           // Page → aggregator
      rec.posterType = 'aggregator';
      aggregators.push(rec);
      continue;
    }
    rec.posterType = classifyPosterType(rec.poster?.name ?? '', aggPages);
    if (rec.posterType === 'aggregator') { aggregators.push(rec); continue; }
    if (rec.ir35 || rec.dayRate) humans.push(rec);             // economics → confirmed hiring
    else ambiguous.push(rec);                                  // person, no economics → needs classify
  }
  return { humans, aggregators, ambiguous };
}

export const DEFAULT_WARM_BLOCK = ['united states', 'usa', 'u.s.', 'w2', 'offshore', 'united arab emirates', 'uae', 'dubai', 'abu dhabi', 'gulf', 'middle east', 'ksa', 'saudi', 'qatar'];

/** Work-arrangement words — not places. Stripped from a location before the country check so "remote" can never stand in for a region. */
export const WORK_ARRANGEMENT = ['remote', 'hybrid', 'on-site', 'on site', 'onsite', 'wfh'];

/** In-region tokens (UK + Ireland + Europe/EU/EEA + US), lowercase, word-boundary matched. Extendable via warm_signals.location_filter.allow. */
export const ALLOWED_REGIONS = [
  // UK
  'united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'gb', 'england', 'scotland', 'wales', 'northern ireland',
  'london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh', 'bristol', 'liverpool', 'sheffield', 'cardiff', 'belfast', 'nottingham', 'newcastle', 'cambridge', 'oxford', 'reading',
  // Ireland
  'ireland', 'republic of ireland', 'dublin',
  // Europe (region words + EU/EEA country names)
  'europe', 'european union', 'eu', 'eea', 'emea',
  'germany', 'france', 'spain', 'italy', 'netherlands', 'belgium', 'luxembourg', 'portugal', 'poland', 'sweden', 'denmark', 'norway', 'finland', 'iceland', 'austria', 'switzerland', 'czechia', 'czech republic', 'slovakia', 'slovenia', 'hungary', 'romania', 'bulgaria', 'greece', 'croatia', 'estonia', 'latvia', 'lithuania', 'malta', 'cyprus',
  // US
  'united states', 'united states of america', 'usa', 'u.s.', 'u.s.a.', 'us', 'america',
];

/** Case-insensitive word-boundary containment: does `token` appear in `text` bounded by non-letters? So 'us' matches "remote (us)" but not "cyprus"/"belarus". Multi-word tokens match as a phrase. @param {string} text @param {string} token @returns {boolean} */
export function regionTokenMatch(text, token) {
  if (typeof text !== 'string' || typeof token !== 'string' || !token) return false;
  const esc = token.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z])${esc}(?:[^a-z]|$)`).test(text.toLowerCase());
}

/** Lowercase+trim a config string-list (non-strings dropped). @param {unknown} v @returns {string[]} */
function _normRegionList(v) {
  return (Array.isArray(v) ? v : []).filter(x => typeof x === 'string').map(x => x.toLowerCase().trim()).filter(Boolean);
}

/**
 * Warm-only region gate (strict allow-only), judged on the poster's location ALONE.
 * block_locations override → veto; strip work-arrangement words; empty residue → pass (no geo signal);
 * residue matches an allowed region → pass; else → veto. The allow-check runs on the work-arrangement-stripped
 * residue, so a "remote" in the allow list (or the location) can never rescue a foreign country.
 * @param {{location_filter?:{allow?:string[]}, block_locations?:string[]}} config
 * @returns {(location:string)=>boolean}
 */
export function buildWarmRegionFilter(config) {
  const allow = [...ALLOWED_REGIONS, ..._normRegionList(config?.location_filter?.allow)];
  const block = _normRegionList(config?.block_locations);
  return (location) => {
    if (typeof location !== 'string' || !location.trim()) return true;   // no geo signal
    const lower = location.toLowerCase();
    if (block.some(t => regionTokenMatch(lower, t))) return false;        // explicit manual override
    let residue = lower;
    for (const w of WORK_ARRANGEMENT) residue = residue.split(w).join(' ');
    if (!residue.replace(/[^a-z]+/g, ' ').trim()) return true;            // only work-arrangement / punctuation → no geo signal
    return allow.some(t => regionTokenMatch(residue, t));                 // country must be allowed
  };
}

/** Content signature for near-duplicate reposts: normalised first 100 chars of the post text (empty when no text → caller falls back to URL dedup). @param {{text?:string}} rec @returns {string} */
export function dupeSignature(rec) {
  const t = (rec?.text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 100) : '';
}

const WARM_LEADS_PATH = 'data/warm-leads.md';
const WARM_SKELETON = `# Warm leads — LinkedIn hiring posts\n\nOpt-in warm-signal discovery (CP-8). Run \`node warm-scan.mjs --spend\` to refresh.\n\n## Warm leads\n\n## Aggregators\n`;
const WARM_DIGEST_PATH = 'data/warm-digest.md';
const DIGEST_SKELETON = `# Warm digest — new leads per run\n\nNewest first. Written by warm-scan.mjs on each --spend run.\n`;

/** Render one warm-leads markdown row. @param {object} record @returns {string} */
export function formatWarmLead(record) {
  const url = String(record?.url || '').replace(/\|/g, '%7C').replace(/[\r\n]/g, '');
  const name = String(record?.poster?.name || '').replace(/\|/g, '/').replace(/[\r\n]/g, ' ');
  const headline = String(record?.poster?.headline || '').replace(/\|/g, '/').replace(/[\r\n]/g, ' ');
  const who = headline ? `${name} — ${headline}` : name;
  const tags = buildWarmTags(record);
  return `- [ ] ${url} | ${who}${tags ? `  ${tags}` : ''}`;
}

/** Insert rows under a `## Heading`, skipping URLs already present. @param {string} text @param {string} heading @param {object[]} records @returns {{text:string, added:object[]}} */
function insertUnder(text, heading, records) {
  const idx = text.indexOf(heading);
  if (idx === -1) return { text, added: [] };
  const afterHeading = idx + heading.length;
  const nextSection = text.indexOf('\n## ', afterHeading);
  const insertAt = nextSection === -1 ? text.length : nextSection;
  const added = records.filter(r => r?.url && !text.includes(`${r.url} |`));
  if (added.length === 0) return { text, added: [] };
  const block = '\n' + added.map(formatWarmLead).join('\n') + '\n';
  return { text: text.slice(0, insertAt) + block + text.slice(insertAt), added };
}

/**
 * Append categorised warm records to warm-leads.md — humans first, aggregators below.
 * Auto-creates the file with a skeleton. Dedups on post URL already present. I/O boundary.
 * @param {{humans:object[], aggregators:object[]}} result
 * @param {string} [file]
 * @returns {{addedHumans:object[], addedAggregators:object[]}}
 */
export function appendToWarmLeads(result, file = WARM_LEADS_PATH) {
  if (!_exists(file)) _write(file, WARM_SKELETON, 'utf-8');
  let text = _read(file, 'utf-8');
  const h = insertUnder(text, '## Warm leads', Array.isArray(result?.humans) ? result.humans : []);
  const a = insertUnder(h.text, '## Aggregators', Array.isArray(result?.aggregators) ? result.aggregators : []);
  _write(file, a.text, 'utf-8');
  return { addedHumans: h.added, addedAggregators: a.added };
}

/**
 * Prepend a dated section of NEW human warm leads to the digest (newest first).
 * Auto-creates with a skeleton. No-op when there are no new humans. I/O boundary.
 * @param {object[]} addedHumans
 * @param {string} date  ISO date, e.g. '2026-07-10'
 * @param {string} [file]
 * @returns {void}
 */
export function appendToWarmDigest(addedHumans, date, file = WARM_DIGEST_PATH) {
  const rows = Array.isArray(addedHumans) ? addedHumans : [];
  if (rows.length === 0) return;
  if (!_exists(file)) _write(file, DIGEST_SKELETON, 'utf-8');
  const text = _read(file, 'utf-8');
  const section = `\n## ${date} (${rows.length} new)\n\n` + rows.map(formatWarmLead).join('\n') + '\n';
  // Insert directly after the skeleton header so the newest section sits on top of prior dated sections.
  const marker = DIGEST_SKELETON;
  const nnIdx = text.indexOf('\n\n');
  const at = text.startsWith(marker) ? marker.length : (nnIdx >= 0 ? nnIdx + 2 : text.length);
  _write(file, text.slice(0, at) + section + text.slice(at), 'utf-8');
}

const APIFY_RESULT_COST_PER_1K = 5; // $5 / 1,000 results (pay-per-result)

/** Estimated USD for a full run: $5/1k × keywords × limit. @param {{keywords?:string[], limit?:number}} config @returns {number} */
export function estimateCost(config) {
  const kw = Array.isArray(config?.keywords) ? config.keywords.length : 0;
  const limit = (typeof config?.limit === 'number' && Number.isFinite(config.limit)) ? config.limit : 30;
  return APIFY_RESULT_COST_PER_1K * (kw * limit) / 1000;
}

/** Pure budget check: true iff usage + estimated spend stays under the cap minus a safety margin. @param {number} usedUsd @param {number} estCost @param {number} capUsd @param {number} margin @returns {boolean} */
export function isWithinBudget(usedUsd, estCost, capUsd, margin) {
  const nums = [usedUsd, estCost, capUsd, margin].map(Number);
  if (!nums.every(Number.isFinite)) return false;
  const [used, est, cap, m] = nums;
  return used + est <= cap - m;
}

/**
 * Network budget guard: GET Apify monthly usage, compare against the cap. Not unit-tested (network).
 * Conservative: on any error, returns false (skip the spend) — the FREE-plan hard cap is only a backstop.
 * @param {(url:string, opts?:object)=>Promise<any>} fetchJson
 * @param {string} token
 * @param {any} config
 * @returns {Promise<{ok:boolean, usedUsd:number|null}>}
 */
export async function checkBudget(fetchJson, token, config) {
  const cap = Number.isFinite(config?.budget_cap_usd) ? config.budget_cap_usd : 5;
  const margin = Number.isFinite(config?.budget_margin_usd) ? config.budget_margin_usd : 0.5;
  const est = estimateCost(config);
  try {
    const url = `https://api.apify.com/v2/users/me/usage/monthly?token=${encodeURIComponent(token)}`;
    const body = /** @type {any} */ (await fetchJson(url));
    const usedUsd = Number(body?.data?.totalUsageCreditsUsdAfterVolumeDiscount);
    return { ok: isWithinBudget(usedUsd, est, cap, margin), usedUsd: Number.isFinite(usedUsd) ? usedUsd : null };
  } catch {
    return { ok: false, usedUsd: null };
  }
}

/** Load portals.yml → warm config with an effective location_filter (user allow list + a warm-specific block list). @param {string} portalsPath @returns {any} */
function loadWarmConfig(portalsPath) {
  const cfg = /** @type {any} */ (yaml.load(_read(portalsPath, 'utf-8')) || {});
  const warm = (cfg.warm_signals && typeof cfg.warm_signals === 'object') ? cfg.warm_signals : {};
  const base = (cfg.location_filter && typeof cfg.location_filter === 'object') ? cfg.location_filter : {};
  const defaultBlock = DEFAULT_WARM_BLOCK;
  const warmBlock = Array.isArray(warm.block_locations) ? warm.block_locations : defaultBlock;
  const location_filter = { ...base, block: [...(Array.isArray(base.block) ? base.block : []), ...warmBlock] };
  // budget_cap_usd / budget_margin_usd (if set on warm_signals) pass through via ...warm; defaults live in checkBudget.
  return { ...warm, location_filter };
}

/**
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function main(argv) {
  const spend = argv.includes('--spend');
  const portalsPath = process.env.CAREER_OPS_PORTALS || 'portals.yml';
  const config = loadWarmConfig(portalsPath);
  const keywords = Array.isArray(config.keywords) ? config.keywords : [];
  const limit = (typeof config.limit === 'number' && Number.isFinite(config.limit)) ? config.limit : 30;

  if (!spend) {
    console.log('DRY PREVIEW — no spend. Pass --spend to run the PAID Apify search.');
    console.log(`  actor:    ${config.actor || '(unset)'}`);
    console.log(`  keywords: ${keywords.length ? keywords.join(', ') : '(none)'}`);
    console.log(`  limit:    ${limit}/keyword`);
    console.log(`  est cost: ~$${estimateCost(config).toFixed(2)} ($5/1k × ${keywords.length} × ${limit})`);
    return;
  }

  const token = process.env.APIFY_TOKEN;
  if (!token || !token.trim()) throw new Error('warm-scan: APIFY_TOKEN not set — add it to .env.');
  if (!config.actor) throw new Error('warm-scan: warm_signals.actor is unset in portals.yml.');
  if (keywords.length === 0) throw new Error('warm-scan: warm_signals.keywords is empty in portals.yml.');

  const ctx = makeHttpCtx();

  // Budget pre-check BEFORE any paid fetch — deliberate skip (exit 0), not an error.
  const budget = await checkBudget(ctx.fetchJson, token.trim(), config);
  if (!budget.ok) {
    const used = budget.usedUsd == null ? 'unknown' : `$${budget.usedUsd.toFixed(2)}`;
    console.log(`budget guard: near/over cap or usage unavailable (used=${used}, est=$${estimateCost(config).toFixed(2)}) — skipping spend.`);
    console.log('NEW_WARM=SKIPPED_BUDGET');
    return;
  }

  const raw = [];
  for (const kw of keywords) {
    console.log(`fetching: ${kw}`);
    const items = await fetchPosts(config.actor, kw, { token: token.trim(), limit, fetchJson: ctx.fetchJson });
    raw.push(...items);
  }
  const result = runWarmChain(raw, config);
  const ambiguous = Array.isArray(result.ambiguous) ? result.ambiguous : [];
  let confirmedFromAmbiguous = [];
  if (ambiguous.length) {
    const intentCfg = (config.hiring_intent && typeof config.hiring_intent === 'object') ? config.hiring_intent : {};
    const key = process.env.GEMINI_API_KEY;
    let verdicts;
    if (intentCfg.enabled !== false && key && key.trim()) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const classify = makeGeminiClassifier({ apiKey: key.trim(), model: intentCfg.model || HIRING_INTENT_DEFAULT_MODEL, GoogleGenerativeAI });
      verdicts = [];
      for (const p of ambiguous) {
        try { verdicts.push(await classify(p)); }
        catch (e) { console.log(`hiring-intent: classify error (${e.message}) — keeping flagged`); verdicts.push(null); }
      }
    } else {
      verdicts = ambiguous.map(() => null); // no key / disabled → keep all, flagged
    }
    confirmedFromAmbiguous = mergeHiringVerdicts(ambiguous, verdicts);
    console.log(`hiring-intent: ${confirmedFromAmbiguous.length}/${ambiguous.length} ambiguous kept, ${ambiguous.length - confirmedFromAmbiguous.length} dropped`);
  }
  const humans = [...result.humans, ...confirmedFromAmbiguous];
  const { addedHumans, addedAggregators } = appendToWarmLeads({ humans, aggregators: result.aggregators });
  const today = new Date().toISOString().slice(0, 10);
  appendToWarmDigest(addedHumans, today);
  console.log(`warm leads: ${humans.length} human, ${result.aggregators.length} aggregator (${addedHumans.length} new human, ${addedAggregators.length} new aggregator) → ${WARM_LEADS_PATH}`);
  console.log(`NEW_WARM=${addedHumans.length}`);
}

// Only run main() when executed directly — importing for tests must not fetch.
if (process.argv[1] && import.meta.url === _p(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(err => { console.error(err.message); process.exit(1); });
}
