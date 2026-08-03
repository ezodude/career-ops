// @ts-check
/** Combined weekly digest: merge new warm leads + pending board offers into one ranked data/this-week.md. Free, no network. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const ROOT = dirname(fileURLToPath(import.meta.url));
const _p = pathToFileURL;

// Reuse CP-12's region primitives (warm-scan.mjs main() is guarded, so this import is side-effect-free).
const { regionTokenMatch, ALLOWED_REGIONS } = /** @type {{regionTokenMatch:(text:string,token:string)=>boolean, ALLOWED_REGIONS:string[]}} */ (await import(_p(join(ROOT, 'warm-scan.mjs')).href));

/** Extract [tag] tokens (lowercased, de-bracketed) from a string. @param {string} s @returns {string[]} */
function extractTags(s) {
  const out = [];
  const re = /\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1].toLowerCase().trim());
  return out;
}

/** Day-rate regex (shared by extract + strip). Matches £750/day, £650perday, £550-650perday. */
const RATE_RE = /£\s?\d[\d,]*(?:\s?[–-]\s?£?\s?\d[\d,]*)?\s?(?:\/|per\s?)?\s?day/ig;

/** Extract a day-rate display string (whitespace-collapsed) or null. @param {string} s @returns {string|null} */
function extractDayRate(s) {
  const m = s.match(new RegExp(RATE_RE.source, 'i'));
  return m ? m[0].replace(/\s+/g, '') : null;
}

/**
 * Parse a checkbox line into a record; null for non-lead lines.
 * @param {string} line @param {'warm'|'board'} source
 * @returns {{source:'warm'|'board', url:string, text:string, tags:string[], dayRate:string|null, ir35:boolean, raw:string}|null}
 */
export function parseLine(line, source) {
  const m = line.match(/^\s*-\s*\[[ xX]\]\s+(\S.*)$/);
  if (!m) return null;
  const body = m[1].trim();
  const parts = body.split(' | ');
  const url = parts[0].trim();
  if (!/^https?:\/\//.test(url)) return null;
  const rest = parts.slice(1).join(' | ');
  const tags = extractTags(rest);
  const dayRate = extractDayRate(rest);
  const ir35 = /outside\s+ir35/i.test(rest);
  const text = rest.replace(/\[[^\]]*\]/g, '').replace(RATE_RE, '').replace(/\s{2,}/g, ' ').trim();
  return { source, url, text, tags, dayRate, ir35, raw: line.trim() };
}

/** Lines of the newest dated `## <date>` section in warm-digest.md (up to the next `## `). @param {string} md @returns {string[]} */
export function extractNewestWarmSection(md) {
  const lines = md.split('\n');
  const start = lines.findIndex(l => /^##\s+\d{4}-\d{2}-\d{2}/.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

/** Unchecked `- [ ]` lines under the `## Pending` section of pipeline.md. @param {string} md @returns {string[]} */
export function extractPendingBoard(md) {
  const lines = md.split('\n');
  const start = lines.findIndex(l => /^##\s+Pending/i.test(l));
  const from = start === -1 ? 0 : start + 1;
  const out = [];
  for (let i = from; i < lines.length; i++) {
    if (start !== -1 && /^##\s/.test(lines[i])) break;
    if (/^\s*-\s*\[\s\]\s/.test(lines[i])) out.push(lines[i]); // unchecked only
  }
  return out;
}

/** @typedef {{source:string, url:string, text:string, tags:string[], dayRate:string|null, ir35:boolean, raw:string, score?:number}} LeadRecord */

/**
 * Read the machine-readable day-rate floor from the user layer (config/profile.yml).
 * Returns null when the file, key, or a valid positive number is absent — callers
 * then skip rate filtering entirely (fail-open, never silently drops on misconfig).
 * @param {string} [root] @returns {number|null}
 */
export function readRateFloor(root = ROOT) {
  const p = join(root, 'config', 'profile.yml');
  if (!existsSync(p)) return null;
  try {
    const doc = /** @type {any} */ (yaml.load(readFileSync(p, 'utf8')));
    const v = doc?.compensation?.day_rate_floor_gbp;
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null; // malformed profile.yml must not break the weekly digest
  }
}

/**
 * True when a lead's STATED day rate tops out below the floor. Uses the UPPER bound of
 * a range (so "£550-650" clears a 650 floor) — the generous direction, matching the
 * pipeline rule that a false drop costs more than a false keep. No stated rate → false.
 * @param {LeadRecord} rec @param {number|null} floor @returns {boolean}
 */
export function rateBelowFloor(rec, floor) {
  if (!floor || !rec.dayRate) return false;
  const nums = (rec.dayRate.match(/\d[\d,]*/g) || []).map(/** @param {string} n */ n => Number(n.replace(/,/g, ''))).filter(Number.isFinite);
  return nums.length > 0 && Math.max(...nums) < floor;
}

/**
 * Low-signal gate. `[intent?]` marks a lead the CP-11 classifier could not confirm as a
 * hiring post (or could not reach the classifier at all) — in practice offshore staffing
 * spam and opinion posts. Excluded from this-week.md; still archived in warm-digest.md.
 * @param {LeadRecord} rec @returns {boolean}
 */
export function isLowIntent(rec) {
  return rec.tags.includes('intent?');
}

/** Regions that sink in the ranking (heuristic demote-only, NOT a hard filter). Lowercase, word-boundary matched. */
export const OUT_OF_REGION_HINTS = [
  'india', 'pakistan', 'bangladesh', 'sri lanka', 'philippines', 'nigeria', 'kenya', 'egypt',
  'dubai', 'uae', 'u.a.e', 'united arab emirates', 'qatar', 'saudi', 'ksa', 'bahrain', 'kuwait', 'oman',
  'singapore', 'malaysia', 'indonesia', 'vietnam', 'thailand',
  'brazil', 'mexico', 'argentina', 'colombia', 'chile', 'peru', 'latin america', 'south america',
];

const REGION_TAGS = ['uk', 'emea', 'europe', 'london', 'gb'];

/** Score a record for ranking (higher = act sooner). @param {LeadRecord} rec @returns {number} */
export function scoreRecord(rec) {
  let s = 0;
  if (rec.source === 'warm') s += 100;
  const inRegion = rec.tags.some(t => REGION_TAGS.includes(t)) || ALLOWED_REGIONS.some(tok => regionTokenMatch(rec.text, tok));
  if (inRegion) s += 30;
  if (OUT_OF_REGION_HINTS.some(h => regionTokenMatch(rec.text, h))) s -= 100;
  if (rec.ir35) s += 20;
  if (rec.dayRate) s += 15;
  if (rec.tags.includes('contract?')) s += 5;
  return s;
}

/**
 * Rank warm (all kept, sorted) + board (sorted, score<0 dropped, then capped). Board overflow
 * counted in `hidden`; low-intent + below-floor leads from BOTH sources counted in `dropped`.
 * @param {LeadRecord[]} warm @param {LeadRecord[]} board
 * @param {{boardCap?:number, rateFloor?:number|null}} [opts]
 * @returns {{warm:LeadRecord[], board:LeadRecord[], hidden:number, dropped:number}}
 */
export function rankAndCap(warm, board, opts = {}) {
  const boardCap = Number.isFinite(opts.boardCap) ? Number(opts.boardCap) : 15;
  const rateFloor = opts.rateFloor ?? null;
  /** Noise gates run BEFORE ranking so dropped leads never consume a board-cap slot. */
  const signal = /** @param {LeadRecord} r */ r => !isLowIntent(r) && !rateBelowFloor(r, rateFloor);
  const warmSignal = warm.filter(signal);
  const boardSignal = board.filter(signal);
  const dropped = (warm.length - warmSignal.length) + (board.length - boardSignal.length);
  /** @param {LeadRecord[]} arr @returns {LeadRecord[]} */
  const rank = arr => arr.map(r => ({ ...r, score: scoreRecord(r) })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const warmRanked = rank(warmSignal);
  const boardRanked = rank(boardSignal);
  const boardKept = boardRanked.filter(r => (r.score ?? 0) >= 0).slice(0, boardCap);
  return { warm: warmRanked, board: boardKept, hidden: boardRanked.length - boardKept.length, dropped };
}

/** Render the combined digest markdown. @param {{warm:LeadRecord[],board:LeadRecord[],hidden:number,dropped?:number}} ranked @param {string} date @returns {string} */
export function renderThisWeek(ranked, date) {
  /** @param {LeadRecord} r */
  const line = r => `- [ ] ${r.url} | ${r.text}${r.dayRate ? ' ' + r.dayRate : ''}`;
  const out = [
    '# This week — combined actionable digest', '',
    'Warmest signal first. Regenerated by weekly.mjs each run (newest warm leads + top in-region board offers).', '',
    `## ${date} (${ranked.warm.length} warm · ${ranked.board.length} board)`, '',
    '### Warm (act first)', '',
    ranked.warm.length ? ranked.warm.map(line).join('\n') : '_(no new warm leads this run)_', '',
    '### Board / ATS', '',
    ranked.board.length ? ranked.board.map(line).join('\n') : '_(no in-region board offers)_',
  ];
  if (ranked.hidden > 0) out.push('', `_(${ranked.hidden} board offers hidden — beyond the top ${ranked.board.length} kept (out-of-region demoted or over the cap); full inbox in data/pipeline.md)_`);
  const dropped = ranked.dropped ?? 0;
  if (dropped > 0) out.push('', `_(${dropped} low-signal leads dropped — unconfirmed hiring intent or stated rate below floor; still archived in data/warm-digest.md)_`);
  out.push('');
  return out.join('\n');
}

/** Read both digests, rank, write data/this-week.md. @param {string[]} [argv] @returns {Promise<{warm:LeadRecord[],board:LeadRecord[],hidden:number}>} */
export async function main(argv = process.argv.slice(2)) {
  const capArg = argv.find(a => a.startsWith('--board-cap='));
  const boardCap = capArg ? Number(capArg.split('=')[1]) : 15;
  const dryRun = argv.includes('--dry-run');
  const warmMd = existsSync(join(ROOT, 'data', 'warm-digest.md')) ? readFileSync(join(ROOT, 'data', 'warm-digest.md'), 'utf8') : '';
  const boardMd = existsSync(join(ROOT, 'data', 'pipeline.md')) ? readFileSync(join(ROOT, 'data', 'pipeline.md'), 'utf8') : '';
  const warm = /** @type {LeadRecord[]} */ (extractNewestWarmSection(warmMd).map(l => parseLine(l, 'warm')).filter(Boolean));
  const board = /** @type {LeadRecord[]} */ (extractPendingBoard(boardMd).map(l => parseLine(l, 'board')).filter(Boolean));
  const rateFloor = argv.includes('--no-rate-floor') ? null : readRateFloor();
  const ranked = rankAndCap(warm, board, { boardCap, rateFloor });
  const date = new Date().toISOString().slice(0, 10);
  const md = renderThisWeek(ranked, date);
  if (dryRun) console.log(md);
  else writeFileSync(join(ROOT, 'data', 'this-week.md'), md);
  console.log(`WEEKLY_WRITTEN warm=${ranked.warm.length} board=${ranked.board.length} hidden=${ranked.hidden} dropped=${ranked.dropped}${dryRun ? ' (dry-run)' : ' → data/this-week.md'}`);
  return ranked;
}

if (process.argv[1] && import.meta.url === _p(process.argv[1]).href) {
  main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
