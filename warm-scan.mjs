#!/usr/bin/env node
// warm-scan.mjs — standalone, opt-in, PAID warm-signal discovery (CP-8).
// Default run = zero-spend dry preview. Actual Apify fetch only on `--spend`.
// Reuses scan.mjs pure helpers; writes data/warm-leads.md (never touches pipeline.md).

/** True when post text matches any job-seeker signal (wrong direction — drop). @param {string} text @param {string[]} signals @returns {boolean} */
export function isJobSeeker(text, signals) {
  if (typeof text !== 'string' || !Array.isArray(signals)) return false;
  const lower = text.toLowerCase();
  return signals.some(s => typeof s === 'string' && s && lower.includes(s.toLowerCase()));
}

import { pathToFileURL as _p } from 'url';
const { compileKeyword, buildLocationFilter } = await import(_p(process.cwd() + '/scan.mjs').href);
const { mapApifyPost } = await import(_p(process.cwd() + '/providers/apify-posts.mjs').href);

/** Classify a poster by name: an aggregator repost page vs an individual human. @param {string} name @param {string[]} aggregatorPages @returns {('human'|'aggregator')} */
export function classifyPosterType(name, aggregatorPages) {
  if (typeof name !== 'string' || !name.trim() || !Array.isArray(aggregatorPages)) return 'human';
  const lower = name.toLowerCase();
  const matchers = aggregatorPages
    .filter(k => typeof k === 'string' && k.length > 0)
    .map(k => compileKeyword(k.toLowerCase()));
  return matchers.some(m => m(lower)) ? 'aggregator' : 'human';
}

/** Triage tags for a warm-leads row: poster-type + region + optional IR35/day-rate. Emits NO [contract?] tag. @param {{posterType?:string,location?:string,ir35?:string,dayRate?:string}} record @returns {string} */
export function buildWarmTags(record) {
  const tags = [record?.posterType === 'aggregator' ? '[aggregator]' : '[warm]'];
  const loc = (record?.location || '').toLowerCase();
  if (/\bremote\b/.test(loc)) tags.push('[remote]');
  else if (/\b(uk|united kingdom|london|england|scotland|wales)\b/.test(loc)) tags.push('[UK]');
  if (record?.ir35 === 'outside') tags.push('[outside IR35]');
  else if (record?.ir35 === 'inside') tags.push('[inside IR35]');
  if (record?.dayRate) tags.push(record.dayRate);
  return tags.join(' ');
}

/**
 * Pure discovery pipeline: raw actor items → categorised warm records.
 * normalise → drop job-seekers → region gate → classify poster-type → dedup on cleaned URL.
 * @param {Record<string, any>[]} rawItems
 * @param {{location_filter?:object, aggregator_pages?:string[], jobseeker_signals?:string[]}} config
 * @returns {{humans:object[], aggregators:object[]}}
 */
export function runWarmChain(rawItems, config) {
  const passesRegion = buildLocationFilter(config?.location_filter);
  const seekerSignals = Array.isArray(config?.jobseeker_signals) ? config.jobseeker_signals : [];
  const aggPages = Array.isArray(config?.aggregator_pages) ? config.aggregator_pages : [];
  const seen = new Set();
  const humans = [];
  const aggregators = [];
  for (const raw of Array.isArray(rawItems) ? rawItems : []) {
    const rec = mapApifyPost(raw);
    if (!rec.url || seen.has(rec.url)) continue;           // dedup on cleaned URL
    if (isJobSeeker(rec.text, seekerSignals)) continue;    // wrong direction
    // Region gate over poster location AND post text (findings §5: either can carry the region).
    if (!passesRegion(rec.location) && !passesRegion(rec.text)) continue;
    seen.add(rec.url);
    rec.posterType = classifyPosterType(rec.poster.name, aggPages);
    (rec.posterType === 'aggregator' ? aggregators : humans).push(rec);
  }
  return { humans, aggregators };
}

import { readFileSync as _read, writeFileSync as _write, existsSync as _exists } from 'fs';

const WARM_LEADS_PATH = 'data/warm-leads.md';
const WARM_SKELETON = `# Warm leads — LinkedIn hiring posts\n\nOpt-in warm-signal discovery (CP-8). Run \`node warm-scan.mjs --spend\` to refresh.\n\n## Warm leads\n\n## Aggregators\n`;

/** Render one warm-leads markdown row. @param {object} record @returns {string} */
export function formatWarmLead(record) {
  const url = String(record?.url || '').replace(/\|/g, '%7C');
  const name = String(record?.poster?.name || '').replace(/\|/g, '/');
  const headline = String(record?.poster?.headline || '').replace(/\|/g, '/');
  const who = headline ? `${name} — ${headline}` : name;
  const tags = buildWarmTags(record);
  return `- [ ] ${url} | ${who}${tags ? `  ${tags}` : ''}`;
}

/** Insert rows under a `## Heading`, skipping URLs already present in the file. @param {string} text @param {string} heading @param {object[]} records @returns {string} */
function insertUnder(text, heading, records) {
  const idx = text.indexOf(heading);
  if (idx === -1) return text;
  const afterHeading = idx + heading.length;
  const nextSection = text.indexOf('\n## ', afterHeading);
  const insertAt = nextSection === -1 ? text.length : nextSection;
  const fresh = records.filter(r => r?.url && !text.includes(r.url)).map(formatWarmLead);
  if (fresh.length === 0) return text;
  const block = '\n' + fresh.join('\n') + '\n';
  return text.slice(0, insertAt) + block + text.slice(insertAt);
}

/**
 * Append categorised warm records to warm-leads.md — humans first, aggregators below.
 * Auto-creates the file with a skeleton. Dedups on post URL already present. I/O boundary.
 * @param {{humans:object[], aggregators:object[]}} result
 * @param {string} [file]
 * @returns {void}
 */
export function appendToWarmLeads(result, file = WARM_LEADS_PATH) {
  if (!_exists(file)) _write(file, WARM_SKELETON, 'utf-8');
  let text = _read(file, 'utf-8');
  text = insertUnder(text, '## Warm leads', Array.isArray(result?.humans) ? result.humans : []);
  text = insertUnder(text, '## Aggregators', Array.isArray(result?.aggregators) ? result.aggregators : []);
  _write(file, text, 'utf-8');
}
