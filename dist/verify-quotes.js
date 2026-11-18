// mike/backend/src/modules/chat/engine/tools/documentOps.ts
function isPunctuation(ch) {
  return !/[\p{L}\p{N}\s]/u.test(ch);
}
function normalizeWithMap(text, opts = {}) {
  const stripPunctuation = opts.stripPunctuation ?? false;
  const norm = [];
  const origIdx = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        norm.push(" ");
        origIdx.push(i);
        prevSpace = true;
      }
    } else if (stripPunctuation && isPunctuation(ch)) {
      continue;
    } else {
      norm.push(ch.toLowerCase());
      origIdx.push(i);
      prevSpace = false;
    }
  }
  return { norm: norm.join(""), origIdx };
}

// mike/backend/src/modules/chat/engine/verifyCitations.ts
var PAGE_BREAK_SENTINEL = "[[PAGE_BREAK]]";
var ELLIPSIS_PATTERN = /\.{3}|…/;
var MAX_PAGE_BREAK_SPAN_CHARS = 5e3;
var MAX_LOCATE_ATTEMPTS = 64;
var UNREADABLE_SOURCES = /* @__PURE__ */ new Set([
  "Document could not be read.",
  "Document not found."
]);
var CHEAP_TIERS = [{}, { stripPunctuation: true }];
var LINE_END_HYPHEN_TIERS = [
  { joinLineEndHyphens: "keep" },
  { joinLineEndHyphens: "drop" },
  { stripPunctuation: true, joinLineEndHyphens: "drop" }
];
var MAY_HAVE_LINE_END_HYPHEN = /[-\u2010\u2011\u00ad][^\S\n\r]*[\n\r]/;
var optionsKey = (opts) => `${opts.stripPunctuation ? "strip" : "punct"}/${opts.joinLineEndHyphens ?? "nojoin"}`;
var prepareSource = (source) => ({ source, normalized: /* @__PURE__ */ new Map(), needles: /* @__PURE__ */ new Map() });
function lineEndHyphenTiers(prepared) {
  prepared.mayHaveLineEndHyphen ??= MAY_HAVE_LINE_END_HYPHEN.test(prepared.source);
  return prepared.mayHaveLineEndHyphen ? LINE_END_HYPHEN_TIERS : [];
}
function createQuoteVerifier(source) {
  const prepared = prepareSource(source);
  return (quote) => verifyQuoteAgainstSource(source, quote, prepared);
}
function locateQuote(source, quote, prepared = prepareSource(source)) {
  if (!source || !quote) return null;
  const exactIdx = source.indexOf(quote);
  if (exactIdx >= 0) {
    return { start: exactIdx, end: exactIdx + quote.length, excerpt: quote };
  }
  for (const opts of [...CHEAP_TIERS, ...lineEndHyphenTiers(prepared)]) {
    const location = locateNormalized(prepared, quote, opts);
    if (location) return location;
  }
  return null;
}
var earliest = (locations) => locations.reduce((first, candidate) => candidate && (!first || candidate.start < first.start) ? candidate : first, null);
function locateQuoteFrom(prepared, quote, from) {
  const { source } = prepared;
  if (from >= source.length) return null;
  const offset = Math.max(0, from);
  const exactIndex = source.indexOf(quote, offset);
  const exact = exactIndex >= 0 ? { start: exactIndex, end: exactIndex + quote.length, excerpt: quote } : null;
  const at = (opts) => locateNormalized(prepared, quote, opts, offset);
  return earliest([exact, ...CHEAP_TIERS.map(at)]) ?? earliest(lineEndHyphenTiers(prepared).map(at));
}
function locateSegmentsInOrder(prepared, segments, maxGap) {
  let attempts = 0;
  const search = (index, from, previousEnd) => {
    if (index === segments.length) return [];
    let cursor = from;
    while (attempts < MAX_LOCATE_ATTEMPTS) {
      attempts += 1;
      const location = locateQuoteFrom(prepared, segments[index], cursor);
      if (!location) return null;
      if (previousEnd !== null && location.start - previousEnd > maxGap) {
        return null;
      }
      const remaining = search(index + 1, location.end, location.end);
      if (remaining) return [location, ...remaining];
      cursor = location.start + 1;
    }
    return null;
  };
  return search(0, 0, null);
}
function locateNormalized(prepared, quote, opts, from = 0) {
  const tier = optionsKey(opts);
  let normalized = prepared.normalized.get(tier);
  if (!normalized) {
    normalized = normalizeWithMap(prepared.source, opts);
    prepared.normalized.set(tier, normalized);
  }
  const { norm, origIdx } = normalized;
  const key = `${tier}:${quote}`;
  let needle = prepared.needles.get(key);
  if (needle === void 0) {
    needle = normalizeWithMap(quote, opts).norm.trim();
    prepared.needles.set(key, needle);
  }
  if (!needle) return null;
  let low = 0, high = origIdx.length;
  while (low < high) {
    const mid = low + high >>> 1;
    if (origIdx[mid] < from) low = mid + 1;
    else high = mid;
  }
  const pos = norm.indexOf(needle, low);
  if (pos < 0) return null;
  const start = origIdx[pos] ?? 0;
  const end = origIdx[pos + needle.length - 1] + 1;
  return { start, end, excerpt: prepared.source.slice(start, end) };
}
function verifyQuoteAgainstSource(source, quote, prepared = prepareSource(source)) {
  if (!source || UNREADABLE_SOURCES.has(source)) {
    return { verified: false, needs_correction: false };
  }
  if (quote.includes(PAGE_BREAK_SENTINEL)) {
    const segments = quote.split(PAGE_BREAK_SENTINEL).map((s) => s.trim()).filter((s) => s.length > 0);
    if (!segments.length) return { verified: false, needs_correction: false };
    const verified = segments.map(
      (seg) => verifyQuoteAgainstSource(source, seg, prepared)
    );
    if (verified.some((result) => !result.verified)) {
      return { verified: false, needs_correction: false };
    }
    const anchorSegments = segments.flatMap((segment) => {
      const fragments = segment.split(ELLIPSIS_PATTERN).map((fragment) => fragment.trim()).filter((fragment) => /[\p{L}\p{N}]/u.test(fragment));
      return fragments.length > 0 ? fragments : [segment];
    });
    const anchors = locateSegmentsInOrder(
      prepared,
      anchorSegments,
      MAX_PAGE_BREAK_SPAN_CHARS
    );
    if (!anchors) {
      return { verified: false, needs_correction: false };
    }
    return {
      verified: true,
      needs_correction: verified.some((result) => result.needs_correction),
      source_excerpt: verified.map((result, index) => result.source_excerpt ?? segments[index]).join(` ${PAGE_BREAK_SENTINEL} `)
    };
  }
  if (ELLIPSIS_PATTERN.test(quote)) {
    const segments = quote.split(ELLIPSIS_PATTERN).map((segment) => segment.trim()).filter((segment) => /[\p{L}\p{N}]/u.test(segment));
    if (!segments.length) return { verified: false, needs_correction: false };
    const located = segments.map((segment) => ({
      segment,
      location: locateQuote(source, segment, prepared)
    }));
    if (located.some(({ location }) => !location)) {
      return { verified: false, needs_correction: false };
    }
    return {
      verified: true,
      needs_correction: located.some(
        ({ segment, location }) => location.excerpt !== segment
      ),
      source_excerpt: located.map(({ location }) => location.excerpt).join(" ... ")
    };
  }
  const loc = locateQuote(source, quote, prepared);
  if (!loc) return { verified: false, needs_correction: false };
  return {
    verified: true,
    needs_correction: loc.excerpt !== quote,
    start_char: loc.start,
    end_char: loc.end,
    source_excerpt: loc.excerpt
  };
}

// cli/read-stdin.ts
async function runJsonTool(handle) {
  try {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("input must be a JSON object");
    }
    process.stdout.write(JSON.stringify(await handle(input)) + "\n");
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) + "\n");
    process.exitCode = 1;
  }
}

// cli/verify-quotes.ts
runJsonTool(async (input) => {
  if (typeof input.source !== "string") throw new Error("source must be a string");
  if (!Array.isArray(input.quotes) || input.quotes.some((q) => typeof q !== "string")) {
    throw new Error("quotes must be an array of strings");
  }
  const verify = createQuoteVerifier(input.source);
  return { results: input.quotes.map((quote) => ({ quote, ...verify(quote) })) };
});
