// @ts-check
// Apify LinkedIn *posts* normaliser — warm-signal discovery (CP-8). A post is a
// poster + text, NOT a Job; this is a separate module from providers/apify.mjs.

/** Parse a UK day rate like "£600/day" or "£450–500/day" from free text. @param {string} text @returns {string|undefined} */
export function parseDayRate(text) {
  if (typeof text !== 'string') return undefined;
  const m = text.match(/£\s?\d[\d,]*(?:\s?[–-]\s?\d[\d,]*)?\s?(?:\/|\s?per\s?)?day/i);
  return m ? m[0].replace(/\s+/g, '') : undefined;
}

/** Detect IR35 status from free text. @param {string} text @returns {('outside'|'inside'|undefined)} */
export function parseIr35(text) {
  if (typeof text !== 'string') return undefined;
  if (/outside\s+ir35/i.test(text)) return 'outside';
  if (/inside\s+ir35/i.test(text)) return 'inside';
  return undefined;
}
