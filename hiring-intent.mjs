// @ts-check
// hiring-intent.mjs — CP-11 semantic gate. A person's in-region post with no rate/IR35 signal
// is ambiguous: is it an actual hiring post, or commentary / self-promotion / seeking work?
// Deterministic filters run first (warm-scan.mjs); this only sees the residue.

/** Default Gemini model for hiring-intent classification. gemini-2.5-flash is 404 for new API keys; 3.1-flash-lite is free-tier and sufficient for binary classification. @type {string} */
export const HIRING_INTENT_DEFAULT_MODEL = 'gemini-3.1-flash-lite';

/** Build the classifier prompt for one post (pure). @param {{text?:string, poster?:{headline?:string}}} post @returns {string} */
export function buildHiringIntentPrompt(post) {
  const text = String(post?.text || '').slice(0, 1500);
  const headline = String(post?.poster?.headline || '');
  return [
    'You classify a single LinkedIn post.',
    'Return ONLY JSON: {"hiring": boolean, "reason": "<=12 words"}.',
    'hiring=true ONLY if the author is offering/advertising an open position (contract or permanent) and inviting applicants.',
    'hiring=false for: commentary, thought-leadership, self-promotion, market opinions, or someone seeking work.',
    'Hiring words used in quotes or criticism, or a first-person "I am being recruited" voice, are NOT hiring.',
    `POSTER HEADLINE: ${headline}`,
    `POST:\n${text}`,
  ].join('\n');
}

/** Merge classifier verdicts into the kept-humans list (pure). hiring→keep; false→drop; null(unavailable)→keep + [intent?]. @param {object[]} ambiguous @param {({hiring:boolean}|null)[]} verdicts @returns {object[]} */
export function mergeHiringVerdicts(ambiguous, verdicts) {
  const kept = [];
  for (let i = 0; i < ambiguous.length; i++) {
    const rec = ambiguous[i];
    const v = verdicts[i];
    if (v == null) {
      kept.push({ ...rec, extraTags: [...(Array.isArray(rec.extraTags) ? rec.extraTags : []), '[intent?]'] });
    } else if (v.hiring === true) {
      kept.push(rec);
    } // else drop
  }
  return kept;
}

/**
 * Build a Gemini-backed classifier (network; not unit-tested). Mirrors gemini-eval.mjs.
 * @param {{apiKey:string, model?:string, GoogleGenerativeAI:any}} opts
 * @returns {(post:object)=>Promise<{hiring:boolean, reason:string}>}
 */
export function makeGeminiClassifier({ apiKey, model = HIRING_INTENT_DEFAULT_MODEL, GoogleGenerativeAI }) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gm = genAI.getGenerativeModel({
    model,
    generationConfig: { temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 256 },
  });
  return async function classify(post) {
    const result = await gm.generateContent([{ text: buildHiringIntentPrompt(post) }]);
    const parsed = JSON.parse(result.response.text()); // throws on malformed JSON — caller (warm-scan main) catches → treats as null (fail-open, keeps + [intent?])
    return { hiring: parsed.hiring === true, reason: typeof parsed.reason === 'string' ? parsed.reason : '' };
  };
}
