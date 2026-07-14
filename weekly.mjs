// @ts-check
/** Combined weekly digest: merge new warm leads + pending board offers into one ranked data/this-week.md. Free, no network. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const _p = pathToFileURL;

// Reuse CP-12's region primitives (warm-scan.mjs main() is guarded, so this import is side-effect-free).
const { regionTokenMatch, ALLOWED_REGIONS } = await import(_p(join(ROOT, 'warm-scan.mjs')).href);

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
